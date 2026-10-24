import { describe, expect, it } from "vitest";
import { detectColumns, mapRows, parseCsv, parseDateValue, parseTimeValue } from "../src/index.js";

describe("parseCsv", () => {
  it("reads Excel-style files: semicolons, quotes, BOM, Windows line ends", () => {
    const text =
      '\uFEFFNome;Cognome;Note\r\nAnna;"Neri";"Celiaca; niente ""glutine"""\r\n\r\nBruno;Gialli;"riga\ndue"\r\n';
    const table = parseCsv(text);
    expect(table.separator).toBe(";");
    expect(table.headers).toEqual(["Nome", "Cognome", "Note"]);
    expect(table.rows).toEqual([
      ["Anna", "Neri", 'Celiaca; niente "glutine"'],
      ["Bruno", "Gialli", "riga\ndue"],
    ]);
  });

  it("falls back to commas", () => {
    expect(parseCsv("a,b\n1,2").rows).toEqual([["1", "2"]]);
  });
});

describe("values", () => {
  it("reads Italian and ISO dates, with or without time", () => {
    expect(parseDateValue("31/10/2026")).toEqual({ date: "2026-10-31", time: null });
    expect(parseDateValue("1.2.26 20:30")).toEqual({ date: "2026-02-01", time: "20:30" });
    expect(parseDateValue("2026-10-31T20:15:00")).toEqual({ date: "2026-10-31", time: "20:15" });
    expect(parseDateValue("31/02/2026")).toBeNull();
    expect(parseDateValue("domani")).toBeNull();
  });

  it("reads times", () => {
    expect(parseTimeValue("20.30")).toBe("20:30");
    expect(parseTimeValue("8:30 PM")).toBe("20:30");
    expect(parseTimeValue("20h05")).toBe("20:05");
    expect(parseTimeValue("25:00")).toBeNull();
  });
});

describe("columns and rows", () => {
  it("recognizes Italian and English headers", () => {
    const columns = detectColumns("guests", [
      "First name",
      "Cognome",
      "Cellulare",
      "E-mail",
      "Tag",
      "Newsletter",
    ]);
    expect(columns).toMatchObject({
      fullName: null,
      firstName: 0,
      lastName: 1,
      phone: 2,
      email: 3,
      tags: 4,
      marketingConsent: 5,
    });
  });

  it("builds guest rows and flags the unusable ones", () => {
    const table = parseCsv(
      "Nome;Cognome;Telefono;Tag;Newsletter\nAnna;Neri;333 111;VIP, Habitué;sì\n;;333 222;;",
    );
    const rows = mapRows("guests", table, detectColumns("guests", table.headers));
    expect(rows[0]).toEqual({
      line: 2,
      problem: null,
      values: {
        fullName: "Anna Neri",
        phone: "333 111",
        email: null,
        note: null,
        tags: ["VIP", "Habitué"],
        marketingConsent: true,
      },
    });
    expect(rows[1]!.problem).toBe("Nome mancante");
  });

  it("builds reservation rows from a combined date-time column", () => {
    const table = parseCsv(
      "Data;Persone;Cliente;Tavolo;Stato\n31/10/2026 20:30;4;Rossi;T7;Confermata\n31/10/2026 21:00;2;Verdi;;Cancellata",
    );
    const rows = mapRows("reservations", table, detectColumns("reservations", table.headers));
    expect(rows[0]!.values).toMatchObject({
      date: "2026-10-31",
      time: "20:30",
      partySize: 4,
      guestName: "Rossi",
      tableName: "T7",
      status: "confirmed",
    });
    expect(rows[1]!.problem).toBe("Cancellata: non importata");
  });
});
