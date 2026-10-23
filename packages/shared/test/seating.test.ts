import { describe, expect, it } from "vitest";
import {
  buildSeatingOptions,
  type SeatingCombination,
  type SeatingInput,
  type SeatingTable,
} from "../src/index.js";

const ROOM = "sala";
const TERRACE = "terrazza";

const table = (name: string, min: number, max: number, extra: Partial<SeatingTable> = {}): SeatingTable => ({
  id: name,
  name,
  roomId: ROOM,
  minCovers: min,
  maxCovers: max,
  priority: 0,
  onlineBookable: true,
  combinationOnly: false,
  isActive: true,
  ...extra,
});

const combo = (
  name: string,
  tableIds: string[],
  min: number,
  max: number,
  extra: Partial<SeatingCombination> = {},
): SeatingCombination => ({
  id: name,
  name,
  tableIds,
  minCovers: min,
  maxCovers: max,
  priority: 0,
  onlineBookable: true,
  isActive: true,
  ...extra,
});

const rooms = [
  { id: ROOM, isActive: true, onlineBookable: true },
  { id: TERRACE, isActive: true, onlineBookable: true },
];

function options(partySize: number, overrides: Partial<SeatingInput> = {}) {
  return buildSeatingOptions({
    partySize,
    channel: "staff",
    tables: [],
    rooms,
    adjacencies: [],
    combinations: [],
    ...overrides,
  });
}

const names = (list: { name: string }[]) => list.map((o) => o.name);

describe("single tables", () => {
  it("offers only tables whose min/max fit the party", () => {
    const tables = [table("T1", 1, 2), table("T2", 2, 4), table("T3", 5, 8)];
    expect(names(options(2, { tables }))).toEqual(["T1", "T2"]);
    expect(names(options(6, { tables }))).toEqual(["T3"]);
    expect(options(9, { tables })).toEqual([]);
  });

  it("puts higher priority tables first, regardless of name or fit", () => {
    const tables = [
      table("T1", 2, 4),
      table("T2", 2, 6, { priority: 10 }),
      table("T3", 2, 4, { priority: 5 }),
    ];
    expect(names(options(4, { tables }))).toEqual(["T2", "T3", "T1"]);
  });

  it("breaks priority ties with the tightest fit, then the table name", () => {
    const tables = [table("T10", 2, 6), table("T9", 2, 4), table("T2", 2, 4)];
    expect(names(options(4, { tables }))).toEqual(["T2", "T9", "T10"]);
  });

  it("skips inactive tables, inactive rooms and combination-only tables", () => {
    const tables = [
      table("T1", 1, 4, { isActive: false }),
      table("T2", 1, 4, { combinationOnly: true }),
      table("D1", 1, 4, { roomId: TERRACE }),
      table("T3", 1, 4),
    ];
    const closedTerrace = [rooms[0]!, { id: TERRACE, isActive: false, onlineBookable: true }];
    expect(names(options(2, { tables, rooms: closedTerrace }))).toEqual(["T3"]);
  });

  it("respects online flags on tables and rooms only for the online channel", () => {
    const tables = [table("T1", 1, 4, { onlineBookable: false }), table("D1", 1, 4, { roomId: TERRACE })];
    const offlineTerrace = [rooms[0]!, { id: TERRACE, isActive: true, onlineBookable: false }];
    expect(names(options(2, { tables, rooms: offlineTerrace }))).toEqual(["D1", "T1"]);
    expect(options(2, { tables, rooms: offlineTerrace, channel: "online" })).toEqual([]);
  });

  it("filters by the service rooms and by the requested room", () => {
    const tables = [table("T1", 1, 4), table("D1", 1, 4, { roomId: TERRACE })];
    expect(names(options(2, { tables, allowedRoomIds: [TERRACE] }))).toEqual(["D1"]);
    expect(names(options(2, { tables, roomId: ROOM }))).toEqual(["T1"]);
    expect(names(options(2, { tables, allowedRoomIds: [] }))).toEqual(["D1", "T1"]);
  });
});

describe("combinations and joined tables", () => {
  const tables = [table("T1", 2, 4), table("T2", 2, 4), table("T3", 2, 4), table("T4", 2, 4)];
  const adjacencies = [
    { tableAId: "T1", tableBId: "T2" },
    { tableAId: "T2", tableBId: "T3" },
  ];

  it("never joins tables when a single table fits", () => {
    expect(names(options(4, { tables, adjacencies }))).toEqual(["T1", "T2", "T3", "T4"]);
  });

  it("joins adjacent tables for larger parties", () => {
    const result = options(6, { tables, adjacencies });
    expect(names(result)).toEqual(["T1+T2", "T2+T3"]);
    expect(result[0]).toMatchObject({ kind: "joined", tableIds: ["T1", "T2"], maxCovers: 8, minCovers: 5 });
  });

  it("joins three tables in a row when two are not enough", () => {
    expect(names(options(10, { tables, adjacencies }))).toEqual(["T1+T2+T3"]);
    expect(options(10, { tables, adjacencies, maxJoinedTables: 2 })).toEqual([]);
  });

  it("only offers minimal groups", () => {
    // 3 adjacent tables can seat 6, but 2 of them already do: the triple is never proposed.
    expect(names(options(6, { tables, adjacencies }))).not.toContain("T1+T2+T3");
  });

  it("does not join tables across rooms or through non-adjacent tables", () => {
    const mixed = [table("T1", 2, 4), table("D1", 2, 4, { roomId: TERRACE }), table("T4", 2, 4)];
    const result = options(6, { tables: mixed, adjacencies: [{ tableAId: "T1", tableBId: "D1" }] });
    expect(result).toEqual([]);
  });

  it("can join combination-only tables", () => {
    const sideTables = [
      table("A", 2, 2, { combinationOnly: true }),
      table("B", 2, 2, { combinationOnly: true }),
    ];
    expect(options(2, { tables: sideTables, adjacencies: [{ tableAId: "A", tableBId: "B" }] })).toEqual([]);
    expect(
      names(options(4, { tables: sideTables, adjacencies: [{ tableAId: "A", tableBId: "B" }] })),
    ).toEqual(["A+B"]);
  });

  it("gives joined tables the average priority of their tables", () => {
    const ranked = [
      table("T1", 2, 4, { priority: 10 }),
      table("T2", 2, 4, { priority: 10 }),
      table("T3", 2, 4),
      table("T4", 2, 4),
    ];
    const result = options(6, {
      tables: ranked,
      adjacencies: [
        { tableAId: "T3", tableBId: "T4" },
        { tableAId: "T2", tableBId: "T3" },
        { tableAId: "T1", tableBId: "T2" },
      ],
    });
    expect(result.map((o) => [o.name, o.priority])).toEqual([
      ["T1+T2", 10],
      ["T2+T3", 5],
      ["T3+T4", 0],
    ]);
  });

  it("prefers predefined combinations over automatic joins, then by priority", () => {
    const combinations = [
      combo("Tavolata", ["T3", "T4"], 5, 8, { priority: 1 }),
      combo("Angolo", ["T1", "T4"], 5, 8, { priority: 7 }),
    ];
    const result = options(6, { tables, adjacencies, combinations });
    expect(result.map((o) => `${o.kind}:${o.name}`)).toEqual([
      "combination:Angolo",
      "combination:Tavolata",
      "joined:T1+T2",
      "joined:T2+T3",
    ]);
  });

  it("does not duplicate a joined group that is already a combination", () => {
    const combinations = [combo("Uno-Due", ["T2", "T1"], 5, 8)];
    expect(names(options(6, { tables, adjacencies, combinations }))).toEqual(["Uno-Due", "T2+T3"]);
  });

  it("drops combinations whose tables are unavailable or that do not fit", () => {
    const combinations = [combo("C1", ["T1", "T2"], 5, 8), combo("C2", ["T3", "T4"], 9, 12)];
    const withInactive = tables.map((t) => (t.id === "T2" ? { ...t, isActive: false } : t));
    expect(names(options(6, { tables: withInactive, combinations }))).toEqual([]);
    expect(
      names(
        options(6, {
          tables,
          combinations: [{ ...combinations[0]!, onlineBookable: false }],
          channel: "online",
        }),
      ),
    ).toEqual([]);
  });
});

describe("room order", () => {
  it("breaks remaining ties with the room order", () => {
    const tables = [table("A1", 2, 4, { roomId: TERRACE }), table("Z9", 2, 4)];
    const ordered = [
      { id: ROOM, isActive: true, onlineBookable: true, sortOrder: 0 },
      { id: TERRACE, isActive: true, onlineBookable: true, sortOrder: 1 },
    ];
    expect(names(options(2, { tables, rooms: ordered }))).toEqual(["Z9", "A1"]);
  });
});
