/*
 * Reading exports from other systems (Superb, spreadsheets): CSV parsing that copes with what Excel and
 * friends produce (semicolons, quotes, BOM, Windows line ends), recognition of columns by their
 * Italian or English names, and conversion of rows into import rows. Pure functions, used by the web
 * app before sending rows to the API, which validates them again.
 */

export type CsvTable = { headers: string[]; rows: string[][]; separator: string };

/** Picks the separator that splits the first line into the most columns. */
function detectSeparator(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const counts = [";", ",", "\t", "|"].map((sep) => {
    let n = 0;
    let quoted = false;
    for (const ch of firstLine) {
      if (ch === '"') quoted = !quoted;
      else if (ch === sep && !quoted) n += 1;
    }
    return [sep, n] as const;
  });
  return counts.sort((a, b) => b[1] - a[1])[0]![1] > 0 ? counts[0]![0] : ",";
}

export function parseCsv(input: string): CsvTable {
  const text = input.replace(/^\uFEFF/, "");
  const separator = detectSeparator(text);
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"' && field === "") {
      quoted = true;
    } else if (ch === separator) {
      record.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field !== "" || record.length > 0) {
    record.push(field);
    records.push(record);
  }

  const nonEmpty = records.filter((r) => r.some((cell) => cell.trim() !== ""));
  const [headers = [], ...rows] = nonEmpty;
  return { headers: headers.map((h) => h.trim()), rows: rows.map((r) => r.map((c) => c.trim())), separator };
}

// ---------------------------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------------------------

export type ImportKind = "guests" | "reservations";

type FieldDef = { key: string; label: string; synonyms: string[] };

/** Target fields with the column names they are usually exported under. */
export const IMPORT_FIELDS: Record<ImportKind, FieldDef[]> = {
  guests: [
    {
      key: "fullName",
      label: "Nome e cognome",
      synonyms: [
        "nome e cognome",
        "nome completo",
        "nominativo",
        "cliente",
        "full name",
        "name",
        "guest",
        "guest name",
      ],
    },
    { key: "firstName", label: "Nome", synonyms: ["nome", "first name", "firstname", "given name"] },
    {
      key: "lastName",
      label: "Cognome",
      synonyms: ["cognome", "last name", "lastname", "surname", "family name"],
    },
    {
      key: "phone",
      label: "Telefono",
      synonyms: [
        "telefono",
        "cellulare",
        "cell",
        "mobile",
        "phone",
        "phone number",
        "tel",
        "numero di telefono",
      ],
    },
    { key: "email", label: "Email", synonyms: ["email", "e mail", "mail", "indirizzo email"] },
    {
      key: "note",
      label: "Note",
      synonyms: ["note", "notes", "nota", "commenti", "allergie", "preferenze", "comments"],
    },
    {
      key: "tags",
      label: "Etichette",
      synonyms: ["tag", "tags", "etichette", "categoria", "categorie", "labels"],
    },
    {
      key: "marketingConsent",
      label: "Consenso marketing",
      synonyms: ["marketing", "newsletter", "consenso marketing", "opt in", "consenso"],
    },
  ],
  reservations: [
    {
      key: "date",
      label: "Data",
      synonyms: ["data", "date", "giorno", "day", "data prenotazione", "booking date"],
    },
    { key: "time", label: "Ora", synonyms: ["ora", "orario", "time", "hour", "ora arrivo", "arrival time"] },
    {
      key: "partySize",
      label: "Persone",
      synonyms: [
        "persone",
        "coperti",
        "pax",
        "ospiti",
        "guests",
        "covers",
        "party size",
        "numero persone",
        "people",
      ],
    },
    {
      key: "guestName",
      label: "Nome e cognome",
      synonyms: ["nome e cognome", "nominativo", "cliente", "name", "guest", "guest name", "full name"],
    },
    { key: "firstName", label: "Nome", synonyms: ["nome", "first name", "firstname"] },
    { key: "lastName", label: "Cognome", synonyms: ["cognome", "last name", "lastname", "surname"] },
    { key: "guestPhone", label: "Telefono", synonyms: ["telefono", "cellulare", "mobile", "phone", "tel"] },
    { key: "guestEmail", label: "Email", synonyms: ["email", "e mail", "mail"] },
    {
      key: "guestNote",
      label: "Richieste del cliente",
      synonyms: [
        "note cliente",
        "richieste",
        "richiesta",
        "note",
        "notes",
        "commenti",
        "comments",
        "allergie",
      ],
    },
    {
      key: "internalNote",
      label: "Note interne",
      synonyms: ["note interne", "internal notes", "note staff", "staff notes", "note ristorante"],
    },
    { key: "tableName", label: "Tavolo", synonyms: ["tavolo", "tavoli", "table", "tables", "numero tavolo"] },
    { key: "status", label: "Stato", synonyms: ["stato", "status"] },
  ],
};

const normalizeHeader = (h: string) =>
  h
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Column index for each field, guessed from the headers (exact names first, then partial). */
export function detectColumns(kind: ImportKind, headers: string[]): Record<string, number | null> {
  const normalized = headers.map(normalizeHeader);
  const taken = new Set<number>();
  const result: Record<string, number | null> = {};
  for (const pass of ["exact", "partial"] as const) {
    for (const field of IMPORT_FIELDS[kind]) {
      if (result[field.key] != null) continue;
      const index = normalized.findIndex(
        (h, i) =>
          !taken.has(i) &&
          field.synonyms.some((s) =>
            pass === "exact" ? h === s : h.startsWith(`${s} `) || h.endsWith(` ${s}`),
          ),
      );
      result[field.key] = index >= 0 ? index : null;
      if (index >= 0) taken.add(index);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, "0");

/** "20:30", "20.30", "20h30", "8:30 PM", "20:30:00" → "20:30". */
export function parseTimeValue(raw: string): string | null {
  const m = /^(\d{1,2})[:.h](\d{2})(?::\d{2})?\s*(am|pm)?$/i.exec(raw.trim());
  if (!m) return null;
  let hours = Number(m[1]);
  const minutes = Number(m[2]);
  const meridiem = m[3]?.toLowerCase();
  if (meridiem === "pm" && hours < 12) hours += 12;
  if (meridiem === "am" && hours === 12) hours = 0;
  return hours < 24 && minutes < 60 ? `${pad(hours)}:${pad(minutes)}` : null;
}

/**
 * Dates as exported in Italy and elsewhere: "2026-10-31", "31/10/2026", "31-10-26", "31.10.2026",
 * optionally followed by a time ("31/10/2026 20:30", "2026-10-31T20:30").
 */
export function parseDateValue(raw: string): { date: string; time: string | null } | null {
  const value = raw.trim();
  const [datePart = "", timePart] = value.split(/[ T]+/, 2);
  let year: number;
  let month: number;
  let day: number;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(datePart);
  if (m) {
    [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  } else {
    m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(datePart);
    if (!m) return null;
    [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (year < 100) year += 2000;
  }
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return { date: `${year}-${pad(month)}-${pad(day)}`, time: timePart ? parseTimeValue(timePart) : null };
}

const YES = new Set(["si", "sì", "yes", "y", "true", "1", "x", "vero", "ok"]);

const STATUS: Record<string, "confirmed" | "requested" | "skip"> = {
  confermata: "confirmed",
  confermato: "confirmed",
  confirmed: "confirmed",
  "in attesa": "requested",
  richiesta: "requested",
  pending: "requested",
  requested: "requested",
  cancellata: "skip",
  annullata: "skip",
  cancelled: "skip",
  canceled: "skip",
  "no show": "skip",
  noshow: "skip",
};

export type MappedRow = { line: number; values: Record<string, unknown>; problem: string | null };

/**
 * Turns CSV rows into import rows using the chosen columns. `line` is the file line (header = 1).
 * Rows with an obvious problem (no name, unreadable date, cancelled booking) carry `problem` and are
 * not sent.
 */
export function mapRows(
  kind: ImportKind,
  table: CsvTable,
  columns: Record<string, number | null>,
): MappedRow[] {
  const cell = (row: string[], key: string) => {
    const index = columns[key];
    return index == null ? "" : (row[index] ?? "").trim();
  };
  const nameOf = (row: string[], full: string) =>
    cell(row, full) || [cell(row, "firstName"), cell(row, "lastName")].filter(Boolean).join(" ");
  const orNull = (v: string) => (v === "" ? null : v);

  return table.rows.map((row, i): MappedRow => {
    const line = i + 2;
    if (kind === "guests") {
      const fullName = nameOf(row, "fullName");
      const consent = cell(row, "marketingConsent");
      return {
        line,
        problem: fullName ? null : "Nome mancante",
        values: {
          fullName,
          phone: orNull(cell(row, "phone")),
          email: orNull(cell(row, "email").toLowerCase()),
          note: orNull(cell(row, "note")),
          tags: cell(row, "tags")
            .split(/[,;|]/)
            .map((t) => t.trim())
            .filter(Boolean),
          marketingConsent: consent ? YES.has(consent.toLowerCase()) : undefined,
        },
      };
    }

    const parsedDate = parseDateValue(cell(row, "date"));
    const time = parseTimeValue(cell(row, "time")) ?? parsedDate?.time ?? null;
    const status = STATUS[cell(row, "status").toLowerCase()];
    const guestName = nameOf(row, "guestName");
    const partySize = Number.parseInt(cell(row, "partySize"), 10);
    const problem = !parsedDate
      ? "Data non leggibile"
      : !time
        ? "Ora non leggibile"
        : !guestName
          ? "Nome mancante"
          : !(partySize > 0)
            ? "Numero di persone mancante"
            : status === "skip"
              ? "Cancellata: non importata"
              : null;
    return {
      line,
      problem,
      values: {
        date: parsedDate?.date,
        time,
        partySize,
        guestName,
        guestPhone: orNull(cell(row, "guestPhone")),
        guestEmail: orNull(cell(row, "guestEmail").toLowerCase()),
        guestNote: orNull(cell(row, "guestNote")),
        internalNote: orNull(cell(row, "internalNote")),
        tableName: orNull(cell(row, "tableName")),
        status: status === "requested" ? "requested" : "confirmed",
      },
    };
  });
}
