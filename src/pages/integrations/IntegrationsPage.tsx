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
import appsReference from "@/assets/integrations-apps-reference.png.asset.json";
import { Button } from "@/components/ui/button";

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
      <header className="relative overflow-hidden border-b border-border">
        <img
          src={appsReference.url}
          alt=""
          className="absolute inset-0 h-full w-full scale-105 object-cover opacity-25 blur-sm"
          aria-hidden="true"
        />
        <div className="absolute inset-0 bg-background/75" aria-hidden="true" />
        <div className="relative mx-auto max-w-4xl px-4 pb-7 pt-4 sm:pb-9">
          <div className="flex items-center gap-2">
            <Button
              onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/chat"))}
              aria-label="Back"
              variant="ghost"
              size="icon-sm"
              className="rounded-full"
            >
              <ArrowLeft className={`h-5 w-5 ${ar ? "rotate-180" : ""}`} />
            </Button>
            <h1 className="text-xl font-semibold">{ar ? "التطبيقات" : "Apps"}</h1>
          </div>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground">
            {ar ? "وصّل تطبيقاتك بميغسي علشان ينفّذ شغلك من مكان واحد." : "Connect the apps Megsy can use to get your work done."}
          </p>
          <div className="relative mt-5 max-w-xl">
            <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={ar ? "ابحث عن تطبيق" : "Search apps"}
              className="w-full rounded-md border border-border bg-background/80 py-2.5 ps-9 pe-4 text-sm outline-none backdrop-blur placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 pb-16 pt-8">
        <div className="grid grid-cols-3 gap-x-4 gap-y-8 sm:grid-cols-5 md:grid-cols-6">
          {list.map((item) => {
            const on = !!connected[item.app];
            return (
              <Button
                key={item.id}
                onClick={() => void toggle(item)}
                title={item.description}
                variant="ghost"
                className="group h-auto min-w-0 flex-col gap-2.5 rounded-md px-1 py-2 text-center"
              >
                <span className="relative grid h-16 w-16 place-items-center rounded-md border border-border bg-card shadow-sm transition-transform group-active:scale-95">
                  <IntegrationLogo item={item} size={56} />
                  {busy === item.app ? (
                    <span className="absolute inset-0 grid place-items-center rounded-md bg-background/70">
                      <Loader2 className="h-5 w-5 animate-spin" />
                    </span>
                  ) : on ? (
                    <span className="absolute -bottom-1 -end-1 grid h-5 w-5 place-items-center rounded-full bg-primary text-primary-foreground ring-2 ring-background">
                      <Check className="h-3 w-3" />
                    </span>
                  ) : null}
                </span>
                <span className="line-clamp-2 w-full text-xs font-medium text-foreground/80">{item.name}</span>
              </Button>
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
