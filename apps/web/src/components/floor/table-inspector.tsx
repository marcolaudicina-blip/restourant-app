"use client";

import { TABLE_SHAPES, type TableFields } from "@restourant/shared";
import { Copy, RotateCw, Trash2, X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { Table } from "@/lib/types";
import { InlineNumber, InlineText } from "../config/inline";
import { useConfigSave } from "../config/use-save";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Switch } from "../ui/field";

const SHAPE_LABELS: Record<(typeof TABLE_SHAPES)[number], string> = {
  round: "Rotondo",
  square: "Quadrato",
  rectangle: "Rettangolare",
};

const SIZE_STEP = 0.5;
const MIN_SIZE = 1;
const MAX_SIZE = 12;

/** "T12" → "T13"; picks the next free name with the same prefix. */
export function nextTableName(tables: Pick<Table, "name">[], like?: string): string {
  const prefix = like?.match(/^(.*?)(\d+)$/)?.[1] ?? tables.at(-1)?.name.match(/^(.*?)(\d+)$/)?.[1] ?? "T";
  const taken = new Set(tables.map((t) => t.name));
  const numbers = tables
    .map((t) => t.name.match(/^(.*?)(\d+)$/))
    .filter((m): m is RegExpMatchArray => m !== null && m[1] === prefix)
    .map((m) => Number(m[2]));
  let n = (numbers.length ? Math.max(...numbers) : 0) + 1;
  while (taken.has(`${prefix}${n}`)) n += 1;
  return `${prefix}${n}`;
}

/** Side panel of the layout editor for the selected table. */
export function TableInspector({
  table,
  allTables,
  onClose,
  onSelect,
}: {
  table: Table;
  allTables: Table[];
  onClose: () => void;
  onSelect: (id: string) => void;
}) {
  const { run, save } = useConfigSave();
  const patch = (body: Partial<TableFields>) => run("PATCH", `/tables/${table.id}`, body);
  const clamp = (v: number) => Math.min(MAX_SIZE, Math.max(MIN_SIZE, v));

  function setShape(shape: Table["shape"]) {
    if (shape === table.shape) return;
    if (shape === "rectangle" && table.width === table.height) {
      return patch({ shape, width: clamp(table.height * 1.5) });
    }
    if (shape !== "rectangle" && table.width !== table.height) {
      const side = Math.max(table.width, table.height);
      return patch({ shape, width: side, height: side });
    }
    patch({ shape });
  }

  async function duplicate() {
    const created = (await save(
      "POST",
      "/tables",
      {
        roomId: table.roomId,
        name: nextTableName(allTables, table.name),
        minCovers: table.minCovers,
        maxCovers: table.maxCovers,
        priority: table.priority,
        shape: table.shape,
        width: table.width,
        height: table.height,
        rotation: table.rotation,
        posX: table.posX + table.width + SIZE_STEP,
        posY: table.posY,
      },
      "Tavolo duplicato",
    ).catch(() => null)) as Table | null;
    if (created) onSelect(created.id);
  }

  return (
    <Card className="flex flex-col gap-4 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Tavolo</p>
          <InlineText
            value={table.name}
            onCommit={(name) => patch({ name })}
            label="Nome tavolo"
            className="-ml-2 text-lg font-semibold"
          />
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Chiudi">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <Row label="Persone">
        <span className="flex items-center gap-1 text-sm">
          da{" "}
          <InlineNumber
            value={table.minCovers}
            min={1}
            max={100}
            label="Persone minime"
            onCommit={(v) => v && patch({ minCovers: v })}
          />
          a{" "}
          <InlineNumber
            value={table.maxCovers}
            min={1}
            max={100}
            label="Persone massime"
            onCommit={(v) => v && patch({ maxCovers: v })}
          />
        </span>
      </Row>

      <Row label="Priorità">
        <InlineNumber
          value={table.priority}
          min={0}
          max={100}
          label="Priorità"
          onCommit={(v) => patch({ priority: v ?? 0 })}
        />
      </Row>

      <div>
        <p className="mb-1.5 text-sm font-medium">Forma</p>
        <div className="grid grid-cols-3 gap-1.5">
          {TABLE_SHAPES.map((shape) => (
            <button
              key={shape}
              onClick={() => setShape(shape)}
              className={cn(
                "flex flex-col items-center gap-1 rounded-lg border px-1 py-2 text-xs",
                table.shape === shape
                  ? "border-brand-600 bg-brand-50 text-brand-700"
                  : "border-line hover:bg-canvas",
              )}
            >
              <span
                className={cn(
                  "border-2 border-current",
                  shape === "round"
                    ? "h-5 w-5 rounded-full"
                    : shape === "square"
                      ? "h-5 w-5 rounded"
                      : "h-4 w-7 rounded",
                )}
              />
              {SHAPE_LABELS[shape]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Stepper
          label="Larghezza"
          value={table.width}
          onChange={(v) =>
            patch({ width: clamp(v), ...(table.shape !== "rectangle" ? { height: clamp(v) } : {}) })
          }
        />
        <Stepper
          label="Profondità"
          value={table.height}
          disabled={table.shape !== "rectangle"}
          onChange={(v) => patch({ height: clamp(v) })}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => patch({ rotation: (table.rotation + 90) % 360 })}
        >
          <RotateCw className="h-4 w-4" /> Ruota
        </Button>
        <Button size="sm" variant="secondary" onClick={duplicate}>
          <Copy className="h-4 w-4" /> Duplica
        </Button>
      </div>

      <Switch
        label="Prenotabile online"
        checked={table.onlineBookable}
        onChange={(onlineBookable) => patch({ onlineBookable })}
      />
      <Switch
        label="Solo se unito"
        description="Mai assegnato da solo"
        checked={table.combinationOnly}
        onChange={(combinationOnly) => patch({ combinationOnly })}
      />
      <Switch label="Attivo" checked={table.isActive} onChange={(isActive) => patch({ isActive })} />

      <Button
        variant="ghost"
        size="sm"
        className="self-start text-red-600 hover:bg-red-50"
        onClick={() => {
          if (!confirm(`Eliminare il tavolo ${table.name}?`)) return;
          run("DELETE", `/tables/${table.id}`, undefined, "Tavolo eliminato");
          onClose();
        }}
      >
        <Trash2 className="h-4 w-4" /> Elimina tavolo
      </Button>
    </Card>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </div>
  );
}

function Stepper({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className={cn(disabled && "opacity-50")}>
      <p className="mb-1 text-sm font-medium">{label}</p>
      <div className="flex items-center rounded-lg border border-line">
        <button
          disabled={disabled || value <= MIN_SIZE}
          onClick={() => onChange(value - SIZE_STEP)}
          className="px-3 py-1.5 font-semibold disabled:text-muted"
          aria-label={`${label}: meno`}
        >
          −
        </button>
        <span className="flex-1 text-center text-sm tabular-nums">{value}</span>
        <button
          disabled={disabled || value >= MAX_SIZE}
          onClick={() => onChange(value + SIZE_STEP)}
          className="px-3 py-1.5 font-semibold disabled:text-muted"
          aria-label={`${label}: più`}
        >
          +
        </button>
      </div>
    </div>
  );
}
