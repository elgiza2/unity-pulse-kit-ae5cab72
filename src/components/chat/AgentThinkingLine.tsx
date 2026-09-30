/** Live "thinking" line for the agent: icon + the agent's real current thought. */
import { Sparkles } from "lucide-react";
import { useUserLang } from "@/lib/authI18n";

export default function AgentThinkingLine({ text }: { text?: string | null }) {
  const isAr = useUserLang() === "ar-eg";
  const line = (text || "").trim() || (isAr ? "بيفكر…" : "Thinking…");
  return (
    <div className="my-2 flex items-start gap-2 text-[13.5px] leading-relaxed text-muted-foreground">
      <Sparkles className="mt-[3px] h-4 w-4 shrink-0 animate-pulse text-primary" />
      <span className="line-clamp-3 animate-pulse">{line}</span>
    </div>
  );
}
