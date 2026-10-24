import { auditLog, diningTables, rooms, users } from "@restourant/db";
import type { ReservationStatus } from "@restourant/shared";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { TenantContext } from "../../lib/context.js";
import { getReservation } from "./reservations.service.js";

/*
 * The story of one booking, from the audit log: who created it, every change of time, party size,
 * tables and status, the emails sent and the guest's rating, with who did what. Each entry is
 * written out in Italian for the staff app (the log keeps the raw changes).
 */

export type HistoryEntry = {
  at: string;
  /** Staff member by name, the guest (booking page or email link), or the system (daily job). */
  actor: { kind: "staff" | "guest" | "system"; name: string };
  title: string;
  lines: string[];
};

const STATUS: Record<ReservationStatus, string> = {
  requested: "Da confermare",
  confirmed: "Confermata",
  arrived: "Arrivata",
  seated: "Seduta",
  completed: "Conclusa",
  no_show: "No-show",
  cancelled: "Cancellata",
};

const EMAILS: Record<string, string> = {
  confirmed: "conferma",
  requested: "richiesta ricevuta",
  updated: "modifica",
  cancelled: "cancellazione",
  reminder: "promemoria",
  review: "com'è andata?",
};

const CHANNEL = { online: "dal sito", staff: "dallo staff", walk_in: "walk-in" } as const;

type Changes = Record<string, unknown> & { from?: Record<string, unknown> };

const day = (date: string) =>
  new Intl.DateTimeFormat("it-IT", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));

export async function getReservationHistory(ctx: TenantContext, id: string): Promise<HistoryEntry[]> {
  const reservation = await getReservation(ctx, id);
  const rows = await ctx.db
    .select({
      entity: auditLog.entity,
      action: auditLog.action,
      changes: auditLog.changes,
      createdAt: auditLog.createdAt,
      actorName: users.fullName,
    })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorUserId))
    .where(
      and(
        eq(auditLog.restaurantId, ctx.restaurantId),
        eq(auditLog.entityId, id),
        inArray(auditLog.entity, ["reservation", "email", "review"]),
      ),
    )
    .orderBy(asc(auditLog.createdAt));

  // Table names for every table the log mentions, with their room.
  const tableIds = new Set<string>();
  for (const row of rows) {
    const c = (row.changes ?? {}) as Changes;
    for (const list of [c.tableIds, c.from?.tableIds]) {
      if (Array.isArray(list)) for (const t of list) if (typeof t === "string") tableIds.add(t);
    }
  }
  const tables = tableIds.size
    ? await ctx.db
        .select({ id: diningTables.id, name: diningTables.name, room: rooms.name })
        .from(diningTables)
        .innerJoin(rooms, eq(rooms.id, diningTables.roomId))
        .where(and(eq(diningTables.restaurantId, ctx.restaurantId), inArray(diningTables.id, [...tableIds])))
    : [];
  const byId = new Map(tables.map((t) => [t.id, t]));
  const collator = new Intl.Collator("it", { numeric: true });
  const tableText = (value: unknown) => {
    const list = Array.isArray(value)
      ? value.map((t) => byId.get(String(t))).filter((t) => t !== undefined)
      : [];
    if (list.length === 0) return "nessun tavolo";
    list.sort((x, y) => collator.compare(x.name, y.name));
    const roomNames = [...new Set(list.map((t) => t.room))];
    return `${list.map((t) => t.name).join("+")} (${roomNames.join(", ")})`;
  };

  return rows.map((row): HistoryEntry => {
    const c = (row.changes ?? {}) as Changes;
    const actor: HistoryEntry["actor"] = row.actorName
      ? { kind: "staff", name: row.actorName }
      : c.by === "guest" || c.privacyAcceptedAt || row.entity === "review"
        ? { kind: "guest", name: "Cliente" }
        : { kind: "system", name: "Sistema" };
    const entry = (title: string, lines: string[] = []): HistoryEntry => ({
      at: row.createdAt.toISOString(),
      actor,
      title,
      lines,
    });

    if (row.entity === "email") {
      const kind = EMAILS[String(c.kind)] ?? String(c.kind);
      const outcome =
        c.status === "sent"
          ? `inviata a ${String(c.to)}`
          : c.status === "not_configured"
            ? "non inviata (email non configurata)"
            : `non inviata a ${String(c.to)}`;
      return { ...entry(`Email «${kind}» ${outcome}`), actor: { kind: "system", name: "Sistema" } };
    }
    if (row.entity === "review") {
      return entry(
        `Giudizio del cliente: ${String(c.rating)} su 5`,
        c.feedback ? ["Ha lasciato un commento"] : [],
      );
    }
    if (row.action === "create") {
      const lines = [
        `${String(c.partySize)} persone, ${day(String(c.date))} ore ${String(c.time)}`,
        `Tavolo: ${tableText(c.tableIds)}`,
      ];
      if (c.guestNote) lines.push(`Richieste: ${String(c.guestNote)}`);
      return entry(`Prenotazione creata ${CHANNEL[reservation.channel]}`, lines);
    }
    return entry(changeTitle(c), changeLines(c, tableText));
  });
}

function changeTitle(c: Changes) {
  const status = c.status as { to?: ReservationStatus } | undefined;
  if (status?.to === "cancelled") return c.by === "guest" ? "Disdetta dal cliente" : "Cancellata";
  if (c.by === "guest") return "Modificata dal cliente";
  if (status?.to && Object.keys(c).every((k) => k === "status" || k === "by" || k === "from")) {
    return "Cambio stato";
  }
  if (c.tableIds && Object.keys(c).every((k) => k === "tableIds" || k === "from")) return "Cambio tavolo";
  return "Modificata";
}

function changeLines(c: Changes, tableText: (value: unknown) => string): string[] {
  const from = c.from ?? {};
  const lines: string[] = [];
  const status = c.status as { from?: ReservationStatus; to?: ReservationStatus } | undefined;
  if (status?.from && status.to) lines.push(`Stato: ${STATUS[status.from]} → ${STATUS[status.to]}`);
  const pair = (label: string, key: string, show: (v: unknown) => string = String) => {
    if (!(key in c) || c[key] === undefined) return;
    const before = from[key];
    if (before !== undefined && JSON.stringify(before) === JSON.stringify(c[key])) return;
    lines.push(
      before !== undefined ? `${label}: ${show(before)} → ${show(c[key])}` : `${label}: ${show(c[key])}`,
    );
  };
  pair("Giorno", "date", (v) => day(String(v)));
  pair("Ora", "time");
  pair("Persone", "partySize");
  pair("Durata", "durationMinutes", (v) => `${String(v)} min`);
  pair("Tavolo", "tableIds", tableText);
  pair("Nome", "guestName");
  pair("Telefono", "guestPhone", (v) => (v ? String(v) : "—"));
  pair("Email", "guestEmail", (v) => (v ? String(v) : "—"));
  if ("guestNote" in c) lines.push("Richieste del cliente modificate");
  if ("internalNote" in c) lines.push("Note interne modificate");
  pair("Lingua delle email", "locale", (v) => (v === "en" ? "inglese" : "italiano"));
  return lines;
}
