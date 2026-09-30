import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Check, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { integrations as CATALOG, type Integration } from "@/lib/integrationsData";
import {
  loadIntegrationConnections,
  startIntegrationConnection,
  disconnectIntegration,
  waitForConnectionRefresh,
} from "@/lib/integrationBackend";
import { IntegrationLogo } from "@/components/chat/integrations/IntegrationRow";
import { useUserLang } from "@/lib/authI18n";

/** Integrations — clean app-grid: icon on top, name below, like a phone home screen. */
export default function IntegrationsPage() {
  const navigate = useNavigate();
  const lang = useUserLang();
  const ar = lang === "ar-eg";
  const [connected, setConnected] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const snap = await loadIntegrationConnections(CATALOG);
      setConnected(snap.connectedApps || {});
      return snap.connectedApps || {};
    } catch {
      return {} as Record<string, boolean>;
    }
  };

  useEffect(() => {
    document.title = "Integrations — Megsy";
    void refresh();
  }, []);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? CATALOG.filter((i) => i.name.toLowerCase().includes(q) || i.description.toLowerCase().includes(q))
      : CATALOG;
    return [...base].sort((a, b) => Number(!!connected[b.app]) - Number(!!connected[a.app]));
  }, [query, connected]);

  const toggle = async (item: Integration) => {
    if (busy) return;
    setBusy(item.app);
    try {
      if (connected[item.app]) {
        await disconnectIntegration(item);
        await refresh();
        toast.success(ar ? `تم فصل ${item.name}` : `Disconnected ${item.name}`);
      } else {
        const res = await startIntegrationConnection(item);
        if ("popup" in res && res.popup) {
          await waitForConnectionRefresh(async () => !!(await refresh())[item.app], res.popup);
        } else {
          await refresh();
        }
        toast.success(ar ? `تم ربط ${item.name}` : `Connected ${item.name}`);
      }
      window.dispatchEvent(new CustomEvent("megsy:integrations-changed"));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Couldn't complete the action");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div dir={ar ? "rtl" : "ltr"} className="min-h-[100dvh] bg-background text-foreground">
      <header className="sticky top-0 z-10 bg-background/90 backdrop-blur px-4 pt-4 pb-3">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-center gap-2">
            <button
              onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/chat"))}
              aria-label="Back"
              className="grid h-9 w-9 place-items-center rounded-full hover:bg-secondary"
            >
              <ArrowLeft className={`h-5 w-5 ${ar ? "rotate-180" : ""}`} />
            </button>
            <h1 className="text-lg font-semibold">{ar ? "التكاملات" : "Integrations"}</h1>
          </div>
          <div className="relative mt-3">
            <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={ar ? "ابحث عن تطبيق" : "Search apps"}
              className="w-full rounded-full bg-secondary py-2.5 ps-9 pe-4 text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-16 pt-2">
        <div className="grid grid-cols-4 gap-x-3 gap-y-6 sm:grid-cols-6">
          {list.map((item) => {
            const on = !!connected[item.app];
            return (
              <button
                key={item.id}
                onClick={() => void toggle(item)}
                title={item.description}
                className="group flex flex-col items-center gap-2 text-center"
              >
                <span className="relative grid h-16 w-16 place-items-center rounded-2xl border border-border bg-card shadow-sm transition-transform group-active:scale-95">
                  <IntegrationLogo item={item} size={56} />
                  {busy === item.app ? (
                    <span className="absolute inset-0 grid place-items-center rounded-2xl bg-background/70">
                      <Loader2 className="h-5 w-5 animate-spin" />
                    </span>
                  ) : on ? (
                    <span className="absolute -bottom-1 -end-1 grid h-5 w-5 place-items-center rounded-full bg-primary text-primary-foreground ring-2 ring-background">
                      <Check className="h-3 w-3" />
                    </span>
                  ) : null}
                </span>
                <span className="line-clamp-1 w-full text-xs text-foreground/80">{item.name}</span>
              </button>
            );
          })}
        </div>
        {list.length === 0 && (
          <p className="py-16 text-center text-sm text-muted-foreground">{ar ? "لا نتائج" : "No results"}</p>
        )}
      </main>
    </div>
  );
}
