"use client";

import {
  detectColumns,
  IMPORT_FIELDS,
  mapRows,
  MAX_GUEST_IMPORT_ROWS,
  parseCsv,
  type CsvTable,
  type ImportKind,
  type ImportResult,
} from "@restourant/shared";
import { useQueryClient } from "@tanstack/react-query";
import { CircleAlert, CircleCheck, FileUp, Info } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { api, describeError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useRestaurant } from "@/lib/restaurant";

/** Rows per request: bookings go through the whole engine, guests are quick. */
const BATCH: Record<ImportKind, number> = { guests: Math.min(500, MAX_GUEST_IMPORT_ROWS), reservations: 25 };

const KINDS: { value: ImportKind; label: string; help: string }[] = [
  {
    value: "guests",
    label: "Clienti",
    help: "Nome, telefono, email, note ed etichette. I clienti già presenti (stesso telefono o email) vengono completati, non duplicati.",
  },
  {
    value: "reservations",
    label: "Prenotazioni future",
    help: "Data, ora, persone e nome; facoltativi telefono, note e tavolo. Quelle passate e quelle già presenti vengono saltate.",
  },
];

export default function ImportPage() {
  const { can } = useRestaurant();
  const [kind, setKind] = useState<ImportKind>("guests");
  const [file, setFile] = useState<{ name: string; table: CsvTable } | null>(null);
  const [columns, setColumns] = useState<Record<string, number | null>>({});
  const [progress, setProgress] = useState<number | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const toast = useToast();
  const queryClient = useQueryClient();
  const { base, restaurantId } = useRestaurant();

  const mapped = useMemo(() => (file ? mapRows(kind, file.table, columns) : []), [file, kind, columns]);
  const ready = mapped.filter((r) => !r.problem);
  const problems = mapped.filter((r) => r.problem);

  if (!can("config.write")) {
    return <p className="text-sm text-muted">L&apos;importazione spetta al titolare e ai manager.</p>;
  }

  function choose(nextKind: ImportKind, table: CsvTable | null) {
    setKind(nextKind);
    setResult(null);
    if (table) setColumns(detectColumns(nextKind, table.headers));
  }

  async function readFile(input: File) {
    const text = await input.text();
    const table = parseCsv(text);
    if (table.headers.length === 0 || table.rows.length === 0) {
      toast.error("Il file è vuoto o non è un CSV");
      return;
    }
    setFile({ name: input.name, table });
    choose(kind, table);
  }

  async function run() {
    const total: ImportResult = { created: 0, updated: 0, skipped: 0, errors: [] };
    const size = BATCH[kind];
    setProgress(0);
    try {
      for (let i = 0; i < ready.length; i += size) {
        const slice = ready.slice(i, i + size);
        // Lines may not be contiguous once unusable rows are left out: send row by row positions.
        const part = await api<ImportResult>(`${base}/import/${kind}`, {
          method: "POST",
          body: { firstRow: 1, rows: slice.map((r) => r.values) },
        });
        total.created += part.created;
        total.updated += part.updated;
        total.skipped += part.skipped;
        total.errors.push(...part.errors.map((e) => ({ row: slice[e.row - 1]!.line, message: e.message })));
        setProgress(Math.min(ready.length, i + size));
      }
      setResult(total);
      await Promise.all(
        ["guests", "reservations", "availability", "activity"].map((family) =>
          queryClient.invalidateQueries({ queryKey: [family, restaurantId] }),
        ),
      );
    } catch (e) {
      toast.error(describeError(e));
      setResult(total);
    } finally {
      setProgress(null);
    }
  }

  const fields = IMPORT_FIELDS[kind];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-3 rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-900">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Da Superb (o da un altro gestionale) esporta i clienti o le prenotazioni in <strong>CSV</strong>. Se
          hai un file Excel, aprilo e salvalo come &quot;CSV&quot;. Le colonne vengono riconosciute da sole:
          controllale prima di importare.
        </p>
      </div>

      <Card>
        <CardHeader title="1. Cosa importi" />
        <div className="flex flex-col gap-4 p-5">
          <div className="flex flex-wrap gap-2">
            {KINDS.map((k) => (
              <button
                key={k.value}
                type="button"
                aria-pressed={kind === k.value}
                onClick={() => choose(k.value, file?.table ?? null)}
                className={cn(
                  "rounded-lg border px-4 py-2 text-sm font-medium",
                  kind === k.value
                    ? "border-brand-600 bg-brand-50 text-brand-700"
                    : "border-line hover:bg-canvas",
                )}
              >
                {k.label}
              </button>
            ))}
          </div>
          <p className="text-sm text-muted">{KINDS.find((k) => k.value === kind)!.help}</p>
          <label className="flex w-fit cursor-pointer items-center gap-2 rounded-lg border border-dashed border-line px-4 py-3 text-sm hover:border-brand-500">
            <FileUp className="h-4 w-4" />
            {file ? `${file.name} · ${file.table.rows.length} righe` : "Scegli il file CSV"}
            <input
              type="file"
              accept=".csv,text/csv,text/plain"
              className="sr-only"
              aria-label="File CSV"
              onChange={(e) => {
                const input = e.target.files?.[0];
                if (input) void readFile(input);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </Card>

      {file && (
        <Card>
          <CardHeader
            title="2. Colonne"
            description="Per ogni dato scegli la colonna del file che lo contiene."
          />
          <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
            {fields.map((field) => (
              <label key={field.key} className="flex flex-col gap-1 text-sm">
                <span className="font-medium">{field.label}</span>
                <Select
                  aria-label={`Colonna per ${field.label}`}
                  value={columns[field.key] ?? ""}
                  onChange={(e) =>
                    setColumns({
                      ...columns,
                      [field.key]: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                >
                  <option value="">— non usare —</option>
                  {file.table.headers.map((header, i) => (
                    <option key={i} value={i}>
                      {header || `Colonna ${i + 1}`}
                    </option>
                  ))}
                </Select>
              </label>
            ))}
          </div>
        </Card>
      )}

      {file && (
        <Card>
          <CardHeader
            title="3. Controlla e importa"
            description={`${ready.length} righe pronte${problems.length ? `, ${problems.length} da sistemare nel file` : ""}.`}
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-4 py-2 font-medium">Riga</th>
                  {fields
                    .filter((f) => f.key !== "firstName" && f.key !== "lastName")
                    .map((f) => (
                      <th key={f.key} className="px-2 py-2 font-medium">
                        {f.label}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {mapped.slice(0, 8).map((row) => (
                  <tr key={row.line} className={cn("border-b border-line", row.problem && "bg-red-50")}>
                    <td className="px-4 py-2 tabular-nums text-muted">{row.line}</td>
                    {fields
                      .filter((f) => f.key !== "firstName" && f.key !== "lastName")
                      .map((f) => {
                        const value = row.values[f.key];
                        return (
                          <td key={f.key} className="max-w-48 truncate px-2 py-2">
                            {Array.isArray(value)
                              ? value.join(", ")
                              : value === true
                                ? "sì"
                                : String(value ?? "")}
                          </td>
                        );
                      })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {problems.length > 0 && (
            <ul className="max-h-40 overflow-auto border-t border-line px-5 py-3 text-sm text-red-700">
              {problems.slice(0, 50).map((p) => (
                <li key={p.line}>
                  Riga {p.line}: {p.problem}
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-4">
            <Button onClick={run} disabled={ready.length === 0} loading={progress !== null}>
              Importa {ready.length} {kind === "guests" ? "clienti" : "prenotazioni"}
            </Button>
            {progress !== null && (
              <span className="text-sm text-muted">
                {progress} / {ready.length}…
              </span>
            )}
          </div>
        </Card>
      )}

      {result && (
        <Card className="p-5" role="status">
          <p className="flex items-center gap-2 font-semibold">
            <CircleCheck className="h-5 w-5 text-brand-600" /> Importazione completata
          </p>
          <p className="mt-1 text-sm text-muted">
            {result.created} aggiunti · {result.updated} aggiornati · {result.skipped} saltati (già presenti o
            passati)
          </p>
          {result.errors.length > 0 && (
            <div className="mt-3">
              <p className="flex items-center gap-2 text-sm font-medium text-red-700">
                <CircleAlert className="h-4 w-4" /> {result.errors.length} righe non importate
              </p>
              <ul className="mt-1 max-h-48 overflow-auto text-sm text-red-700">
                {result.errors.slice(0, 100).map((e, i) => (
                  <li key={i}>
                    Riga {e.row}: {e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
