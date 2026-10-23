"use client";

import { Combine, Pencil, Plus, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useConfigSave } from "@/components/config/use-save";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardHeader, EmptyState } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Switch } from "@/components/ui/field";
import { PageLoader } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";
import { byName } from "@/lib/labels";
import { useConfig } from "@/lib/queries";
import { useRestaurant } from "@/lib/restaurant";
import type { Combination } from "@/lib/types";

export default function CombinationsPage() {
  const config = useConfig();
  const { can } = useRestaurant();
  const { run } = useConfigSave();
  const [editing, setEditing] = useState<Combination | "new" | null>(null);

  if (config.isPending) return <PageLoader />;
  const combinations = [...(config.data?.combinations ?? [])].sort(
    (a, b) => b.priority - a.priority || a.name.localeCompare(b.name),
  );
  const tableName = new Map((config.data?.tables ?? []).map((t) => [t.id, t.name]));
  const editable = can("config.write");

  return (
    <Card>
      <CardHeader
        title="Combinazioni di tavoli"
        description="Gruppi di tavoli che si uniscono per i gruppi numerosi. Il sistema li propone dopo i tavoli singoli e prima delle unioni automatiche, in ordine di priorità."
        actions={
          editable && (
            <Button onClick={() => setEditing("new")}>
              <Plus className="h-4 w-4" /> Nuova combinazione
            </Button>
          )
        }
      />
      {combinations.length === 0 ? (
        <EmptyState icon={<Combine className="h-8 w-8" />} title="Nessuna combinazione">
          Anche senza combinazioni il sistema unisce da solo i tavoli segnati come affiancati sulla piantina.
        </EmptyState>
      ) : (
        <ul>
          {combinations.map((c) => (
            <li
              key={c.id}
              className={cn(
                "flex flex-wrap items-center gap-3 border-b border-line px-5 py-3 last:border-b-0",
                !c.isActive && "opacity-50",
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium">{c.name}</p>
                <p className="text-sm text-muted">
                  {c.tableIds.map((id) => tableName.get(id) ?? "?").join(" + ")} · da {c.minCovers} a{" "}
                  {c.maxCovers} persone
                </p>
              </div>
              <Badge className="bg-brand-50 text-brand-700">Priorità {c.priority}</Badge>
              {!c.onlineBookable && <Badge className="bg-canvas text-muted">Solo staff</Badge>}
              {editable && (
                <>
                  <Button variant="ghost" size="icon" onClick={() => setEditing(c)} aria-label="Modifica">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Elimina"
                    onClick={() =>
                      confirm(`Eliminare "${c.name}"?`) &&
                      run("DELETE", `/combinations/${c.id}`, undefined, "Combinazione eliminata")
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <CombinationDialog
          combination={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </Card>
  );
}

function CombinationDialog({
  combination,
  onClose,
}: {
  combination: Combination | null;
  onClose: () => void;
}) {
  const config = useConfig();
  const { save, pending } = useConfigSave();
  const [tableIds, setTableIds] = useState<string[]>(combination?.tableIds ?? []);
  const [onlineBookable, setOnline] = useState(combination?.onlineBookable ?? true);
  const [isActive, setActive] = useState(combination?.isActive ?? true);
  const tables = config.data?.tables ?? [];
  const rooms = config.data?.rooms ?? [];
  const capacity = tables.filter((t) => tableIds.includes(t.id)).reduce((sum, t) => sum + t.maxCovers, 0);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const body = {
      name: String(data.get("name")),
      tableIds,
      minCovers: Number(data.get("minCovers")),
      maxCovers: Number(data.get("maxCovers")),
      priority: Number(data.get("priority") || 0),
      onlineBookable,
      isActive,
    };
    await (
      combination
        ? save("PATCH", `/combinations/${combination.id}`, body, "Combinazione aggiornata")
        : save("POST", "/combinations", body, "Combinazione creata")
    )
      .then(onClose)
      .catch(() => undefined);
  }

  return (
    <Dialog open onClose={onClose} title={combination ? "Modifica combinazione" : "Nuova combinazione"}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Nome">
          {(id) => (
            <Input id={id} name="name" required defaultValue={combination?.name} placeholder="Es. Tavolata" />
          )}
        </Field>
        <div>
          <p className="mb-1.5 text-sm font-medium">Tavoli</p>
          {rooms.map((room) => {
            const roomTables = tables.filter((t) => t.roomId === room.id).sort(byName);
            if (roomTables.length === 0) return null;
            return (
              <div key={room.id} className="mb-2">
                <p className="mb-1 text-xs uppercase tracking-wide text-muted">{room.name}</p>
                <div className="flex flex-wrap gap-1.5">
                  {roomTables.map((t) => {
                    const on = tableIds.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() =>
                          setTableIds((ids) => (on ? ids.filter((x) => x !== t.id) : [...ids, t.id]))
                        }
                        className={cn(
                          "rounded-lg border px-2.5 py-1 text-sm",
                          on ? "border-brand-600 bg-brand-600 text-white" : "border-line hover:bg-canvas",
                        )}
                      >
                        {t.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <p className="text-xs text-muted">
            {tableIds.length} tavoli selezionati · {capacity} posti in tutto
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Min persone">
            {(id) => (
              <Input
                id={id}
                name="minCovers"
                type="number"
                min={1}
                required
                defaultValue={combination?.minCovers ?? 5}
              />
            )}
          </Field>
          <Field label="Max persone">
            {(id) => (
              <Input
                id={id}
                name="maxCovers"
                type="number"
                min={1}
                required
                defaultValue={combination?.maxCovers ?? (capacity || 8)}
              />
            )}
          </Field>
          <Field label="Priorità" hint="0–100">
            {(id) => (
              <Input
                id={id}
                name="priority"
                type="number"
                min={0}
                max={100}
                defaultValue={combination?.priority ?? 0}
              />
            )}
          </Field>
        </div>
        <Switch label="Prenotabile online" checked={onlineBookable} onChange={setOnline} />
        <Switch label="Attiva" checked={isActive} onChange={setActive} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Annulla
          </Button>
          <Button type="submit" loading={pending} disabled={tableIds.length < 2}>
            Salva
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
