"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/card";
import { PageLoader } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { api, describeError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useTemplates } from "@/lib/queries";
import { useRestaurant } from "@/lib/restaurant";

/** First-run wizard: pick the closest starter layout, then fine-tune it. */
export default function WelcomePage() {
  const templates = useTemplates();
  const { base, name } = useRestaurant();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [choice, setChoice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function apply() {
    if (!choice) return;
    setPending(true);
    try {
      await api(`${base}/setup/apply-template`, { method: "POST", body: { template: choice } });
      await queryClient.invalidateQueries();
      toast.success("Locale configurato: ora personalizza tavoli e orari");
      router.replace("/configurazione");
    } catch (e) {
      toast.error(describeError(e));
      setPending(false);
    }
  }

  if (templates.isPending) return <PageLoader />;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={`Benvenuto, ${name}`}
        description="Scegli il modello più simile al tuo locale: crea sale, tavoli, servizi e durate. Poi cambi tutto come vuoi."
      />
      <div className="grid gap-4 md:grid-cols-3">
        {templates.data?.map((t) => (
          <button key={t.key} onClick={() => setChoice(t.key)} className="text-left">
            <Card
              className={cn(
                "h-full p-5 transition-shadow hover:shadow-md",
                choice === t.key && "border-brand-600 ring-2 ring-brand-500/30",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-semibold">{t.name}</h2>
                {choice === t.key && <Check className="h-5 w-5 text-brand-600" />}
              </div>
              <p className="mt-2 text-sm text-muted">{t.description}</p>
              <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                <Metric label="Sale" value={t.summary.rooms} />
                <Metric label="Tavoli" value={t.summary.tables} />
                <Metric label="Posti" value={t.summary.covers} />
              </dl>
              <p className="mt-3 text-xs text-muted">Servizi: {t.summary.services.join(", ")}</p>
            </Card>
          </button>
        ))}
      </div>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" onClick={() => router.replace("/configurazione/tavoli")}>
          Configuro da zero
        </Button>
        <Button size="lg" disabled={!choice} loading={pending} onClick={apply}>
          Usa questo modello <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-canvas py-2">
      <dd className="text-lg font-semibold">{value}</dd>
      <dt className="text-xs text-muted">{label}</dt>
    </div>
  );
}
