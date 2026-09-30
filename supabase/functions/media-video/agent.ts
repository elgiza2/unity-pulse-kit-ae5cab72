// The single Megsy agent: Browser Use Cloud (v2) on the DeepSeek model.
// Served by the media-video function under body.kind === "agent" (new edge
// functions can't be created from this project).
// Actions: create | poll | stop — same response shape as the old computer-agent.
import { noteKeyAttempt, noteKeyFail, noteKeyOk, vaultKeys } from "./_shared/keyVault.ts";

const BU = "https://api.browser-use.com/api/v2";
const LLM = "deepseek-v4-flash-vision";
const PROVIDER = "browser-use";

const SYSTEM = `You are Megsy, a general-purpose agent. Decide yourself what the task needs.
- If the answer needs no website, answer directly with the done action; do not open a browser.
- Only browse when the task truly needs live web data or a web interaction.
- When asked to build a website, document, spreadsheet, code or any file, write it as a file and return it.
- Do not generate images or videos yourself.
- Reply in the same language the user wrote in.`;

async function bu(key: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`${BU}${path}`, {
    ...init,
    headers: {
      "X-Browser-Use-API-Key": key,
      "Content-Type": "application/json",
      ...((init.headers as Record<string, string>) || {}),
    },
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(`Browser Use ${res.status}: ${text.slice(0, 300)}`);
    (err as any).providerStatus = res.status;
    throw err;
  }
  return data;
}

function mapStatus(s: string) {
  if (s === "finished") return "done";
  if (s === "failed" || s === "stopped") return "failed";
  return "running";
}

export async function handleAgent(
  db: any,
  userId: string,
  body: any,
  out: (b: unknown, s?: number) => Response,
) {
  if (body.action === "create") {
    const prompt = String(body.prompt || "").trim();
    if (!prompt) return out({ error: "prompt is required" }, 400);
    const keys = await vaultKeys(PROVIDER);
    if (!keys.length) return out({ error: "no_capacity" }, 503);
    let lastError = "provider_error";
    for (const key of keys) {
      await noteKeyAttempt(key);
      try {
        const task = await bu(key.key, "/tasks", {
          method: "POST",
          body: JSON.stringify({
            task: prompt,
            llm: LLM,
            maxSteps: 60,
            // Fast mode: quick answers for simple turns, same agent + model.
            flashMode: true,
            systemPromptExtension: SYSTEM,
            metadata: { user_id: userId },
          }),
        });
        await noteKeyOk(key);
        const { data: row, error } = await db
          .from("computer_tasks")
          .insert({
            user_id: userId,
            prompt,
            status: "running",
            conversation_id: body.conversation_id ?? null,
            message_id: body.message_id ?? null,
            provider_task_id: String(task.id),
            provider_session_id: task.sessionId ? String(task.sessionId) : null,
            provider_key_ref: key.id,
            files: [],
          })
          .select("id")
          .single();
        if (error) return out({ error: error.message }, 500);
        return out({ task_id: row.id, status: "running" });
      } catch (e) {
        lastError = e instanceof Error ? e.message : lastError;
        const status = Number((e as any)?.providerStatus || 500);
        await noteKeyFail(key, lastError, status);
        if (status === 403 && /free plan|buy credits/i.test(lastError)) {
          return out({ error: "agent_plan_locked" }, 402);
        }
        if (status === 400 || status === 422) break;
      }
    }
    return out({ error: "provider_error", message: lastError }, 502);
  }

  const { data: row } = await db
    .from("computer_tasks")
    .select("*")
    .eq("id", String(body.task_id || ""))
    .eq("user_id", userId)
    .maybeSingle();
  if (!row) return out({ error: "not found" }, 404);
  const key = (await vaultKeys(PROVIDER)).find((k) => k.id === row.provider_key_ref);
  if (!key) return out({ error: "no_capacity" }, 503);

  if (body.action === "stop") {
    if (row.provider_session_id)
      await bu(key.key, `/sessions/${row.provider_session_id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "stop" }),
      }).catch(() => null);
    await db.from("computer_tasks").update({ status: "failed", error: "stopped" }).eq("id", row.id);
    return out({ ok: true });
  }

  const t = await bu(key.key, `/tasks/${row.provider_task_id}`);
  const status = mapStatus(String(t?.status || ""));
  const steps: any[] = Array.isArray(t?.steps) ? t.steps : [];
  // The computer is only shown when the agent actually opened a real page.
  const browsed = steps.some((s) => s?.url && !/^(about:blank|chrome:)/.test(String(s.url)));

  let liveUrl: string | null = null;
  if (status === "running" && browsed && row.provider_session_id) {
    const s = await bu(key.key, `/sessions/${row.provider_session_id}`).catch(() => null);
    liveUrl = s?.liveUrl ?? null;
  }

  // Files only when the agent really produced some.
  let files: any[] = Array.isArray(row.files) ? row.files : [];
  if (status === "done" && !files.length && Array.isArray(t?.outputFiles)) {
    for (const f of t.outputFiles) {
      try {
        const link = await bu(key.key, `/files/tasks/${row.provider_task_id}/output-files/${f.id}`);
        const url = link?.downloadUrl ?? link?.url;
        if (url) files.push({ name: f.fileName, url });
      } catch {
        /* skip unreadable file */
      }
    }
  }

  const task = {
    id: row.id,
    status,
    progress: steps.length ? String(steps[steps.length - 1]?.nextGoal || "") : null,
    result_text: status === "done" ? String(t?.output ?? "") : null,
    files,
    error: status === "failed" ? String(t?.output || "failed") : null,
    prompt: row.prompt,
    live_url: liveUrl,
    created_at: row.created_at,
    updated_at: row.updated_at,
    provider_session_id: browsed ? row.provider_session_id : null,
  };
  if (status !== "running")
    await db
      .from("computer_tasks")
      .update({ status, result_text: task.result_text, error: task.error, files })
      .eq("id", row.id)
      .eq("status", "running");

  const events = steps
    .filter((s) => s?.nextGoal || s?.evaluationPreviousGoal)
    .map((s) => ({
      id: `${row.id}-${s.number}`,
      title: String(s.nextGoal || s.evaluationPreviousGoal),
      detail: s.memory ? String(s.memory) : null,
      url: browsed ? (s.url ?? null) : null,
      created_at: row.created_at,
      kind: browsed ? "browser" : "think",
      duration: s.duration ?? null,
      screenshot_url: browsed ? (s.screenshotUrl ?? null) : null,
    }));
  return out({ task, events });
}
