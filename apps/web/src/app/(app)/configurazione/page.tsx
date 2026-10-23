"use client";

import { gridPosition } from "@restourant/shared";
import { Info, Plus, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { InlineCheck, InlineNumber, InlineText } from "@/components/config/inline";
import { useConfigSave } from "@/components/config/use-save";
import { Button } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/card";
import { Input, Switch } from "@/components/ui/field";
import { PageLoader } from "@/components/ui/spinner";
import { byName } from "@/lib/labels";
import { useConfig } from "@/lib/queries";
import { useRestaurant } from "@/lib/restaurant";
import type { Room, Table } from "@/lib/types";

export default function RoomsAndTablesPage() {
  const config = useConfig();
  const { can } = useRestaurant();
  const { save, run } = useConfigSave();
  const [newRoom, setNewRoom] = useState("");

  if (config.isPending) return <PageLoader />;
  const rooms = config.data?.rooms ?? [];
  const tables = config.data?.tables ?? [];
  const editable = can("config.write");

  async function addRoom(event: FormEvent) {
    event.preventDefault();
    if (!newRoom.trim()) return;
    await save(
      "POST",
      "/rooms",
      { name: newRoom.trim(), sortOrder: rooms.length },
      `Sala "${newRoom.trim()}" creata`,
    ).catch(() => undefined);
    setNewRoom("");
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-3 rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-900">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          La <strong>priorità</strong> decide quali tavoli il sistema propone per primi: più è alta, prima
          viene scelto. I tavoli <strong>solo unito</strong> non vengono mai dati da soli. Per unire tavoli
          vicini usa <em>Sala → Modifica disposizione → Tavoli affiancati</em>, oppure crea una combinazione.
        </p>
      </div>

      {rooms.length === 0 && (
        <Card>
          <EmptyState title="Nessuna sala">Crea la prima sala, poi aggiungi i tavoli.</EmptyState>
        </Card>
      )}

      {rooms.map((room) => (
        <RoomCard
          key={room.id}
          room={room}
          tables={tables.filter((t) => t.roomId === room.id).sort(byName)}
          editable={editable}
          run={run}
          save={save}
        />
      ))}

      {editable && (
        <form onSubmit={addRoom} className="flex gap-2">
          <Input
            value={newRoom}
            onChange={(e) => setNewRoom(e.target.value)}
            placeholder="Nuova sala, es. Terrazza"
            className="max-w-xs"
          />
          <Button type="submit" variant="secondary">
            <Plus className="h-4 w-4" /> Aggiungi sala
          </Button>
        </form>
      )}
    </div>
  );
}

type Save = ReturnType<typeof useConfigSave>;

function RoomCard({
  room,
  tables,
  editable,
  run,
  save,
}: {
  room: Room;
  tables: Table[];
  editable: boolean;
  run: Save["run"];
  save: Save["save"];
}) {
  const patchRoom = (body: Partial<Room>) => run("PATCH", `/rooms/${room.id}`, body);
  const patchTable = (table: Table, body: Partial<Table>) => run("PATCH", `/tables/${table.id}`, body);
  const covers = tables.filter((t) => t.isActive).reduce((sum, t) => sum + t.maxCovers, 0);

  async function addTable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    await save(
      "POST",
      "/tables",
      {
        roomId: room.id,
        name: String(data.get("name")),
        minCovers: Number(data.get("minCovers")),
        maxCovers: Number(data.get("maxCovers")),
        priority: Number(data.get("priority") || 0),
        ...gridPosition(tables.length),
      },
      "Tavolo aggiunto",
    )
      .then(() => form.reset())
      .catch(() => undefined);
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="flex min-w-48 flex-1 items-center gap-2">
          {editable ? (
            <InlineText
              value={room.name}
              onCommit={(name) => patchRoom({ name })}
              label="Nome sala"
              className="text-base font-semibold"
            />
          ) : (
            <h2 className="font-semibold">{room.name}</h2>
          )}
          <span className="whitespace-nowrap text-sm text-muted">
            {tables.length} tavoli · {covers} posti
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Switch
            label="Attiva"
            checked={room.isActive}
            disabled={!editable}
            onChange={(isActive) => patchRoom({ isActive })}
          />
          <Switch
            label="Online"
            checked={room.onlineBookable}
            disabled={!editable}
            onChange={(onlineBookable) => patchRoom({ onlineBookable })}
          />
          <Switch
            label="Scelta dal cliente"
            checked={room.guestSelectable}
            disabled={!editable}
            onChange={(guestSelectable) => patchRoom({ guestSelectable })}
          />
          {editable && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Elimina sala"
              onClick={() => {
                if (confirm(`Eliminare la sala "${room.name}" e tutti i suoi tavoli?`))
                  run("DELETE", `/rooms/${room.id}`, undefined, "Sala eliminata");
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <fieldset disabled={!editable} className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-2 font-medium">Tavolo</th>
              <th className="px-2 py-2 font-medium">Min</th>
              <th className="px-2 py-2 font-medium">Max</th>
              <th className="px-2 py-2 font-medium">Priorità</th>
              <th className="px-2 py-2 text-center font-medium">Online</th>
              <th className="px-2 py-2 text-center font-medium">Solo unito</th>
              <th className="px-2 py-2 text-center font-medium">Attivo</th>
              <th className="w-12" />
            </tr>
          </thead>
          <tbody>
            {tables.map((table) => (
              <tr key={table.id} className="border-t border-line">
                <td className="px-2 py-1">
                  <InlineText
                    value={table.name}
                    onCommit={(name) => patchTable(table, { name })}
                    label="Nome tavolo"
                    className="font-medium"
                  />
                </td>
                <td className="px-0 py-1">
                  <InlineNumber
                    value={table.minCovers}
                    min={1}
                    max={100}
                    label="Coperti minimi"
                    onCommit={(v) => v && patchTable(table, { minCovers: v })}
                  />
                </td>
                <td className="px-0 py-1">
                  <InlineNumber
                    value={table.maxCovers}
                    min={1}
                    max={100}
                    label="Coperti massimi"
                    onCommit={(v) => v && patchTable(table, { maxCovers: v })}
                  />
                </td>
                <td className="px-0 py-1">
                  <InlineNumber
                    value={table.priority}
                    min={0}
                    max={100}
                    label="Priorità"
                    onCommit={(v) => patchTable(table, { priority: v ?? 0 })}
                  />
                </td>
                <td className="text-center">
                  <InlineCheck
                    label="Prenotabile online"
                    checked={table.onlineBookable}
                    onChange={(onlineBookable) => patchTable(table, { onlineBookable })}
                  />
                </td>
                <td className="text-center">
                  <InlineCheck
                    label="Solo unito"
                    checked={table.combinationOnly}
                    onChange={(combinationOnly) => patchTable(table, { combinationOnly })}
                  />
                </td>
                <td className="text-center">
                  <InlineCheck
                    label="Attivo"
                    checked={table.isActive}
                    onChange={(isActive) => patchTable(table, { isActive })}
                  />
                </td>
                <td className="pr-2 text-right">
                  {editable && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Elimina tavolo ${table.name}`}
                      onClick={() =>
                        confirm(`Eliminare il tavolo ${table.name}?`) &&
                        run("DELETE", `/tables/${table.id}`, undefined, "Tavolo eliminato")
                      }
                    >
                      <Trash2 className="h-4 w-4 text-muted" />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </fieldset>

      {editable && (
        <form onSubmit={addTable} className="flex flex-wrap items-end gap-2 border-t border-line px-4 py-3">
          <Input
            name="name"
            required
            placeholder="Nome, es. 12"
            className="w-32"
            aria-label="Nome nuovo tavolo"
          />
          <Input
            name="minCovers"
            type="number"
            min={1}
            required
            defaultValue={2}
            className="w-20"
            aria-label="Coperti minimi"
          />
          <Input
            name="maxCovers"
            type="number"
            min={1}
            required
            defaultValue={4}
            className="w-20"
            aria-label="Coperti massimi"
          />
          <Input
            name="priority"
            type="number"
            min={0}
            max={100}
            defaultValue={0}
            className="w-24"
            aria-label="Priorità"
          />
          <Button type="submit" variant="secondary">
            <Plus className="h-4 w-4" /> Tavolo
          </Button>
        </form>
      )}
    </Card>
  );
}
