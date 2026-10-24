import type { Channel } from "./schedule.js";

/*
 * Seating options: every way a party can be seated, ranked best first.
 *
 * Three kinds, always offered in this order:
 *   1. table        a single table whose min/max covers fit the party
 *   2. combination  a predefined group of tables (set up by the restaurant)
 *   3. joined       adjacent tables pushed together, discovered from the floor plan
 *
 * Within a kind: higher priority first, then the tightest fit (fewest empty seats), then fewer tables,
 * then the room order (main room first) and the table name. A joined option takes the average
 * priority of its tables. Online, tables count with their online capacity (`onlineMaxCovers`).
 */

export type SeatingTable = {
  id: string;
  name: string;
  roomId: string;
  minCovers: number;
  maxCovers: number;
  priority: number;
  onlineBookable: boolean;
  /** Online parties up to this size only; null or missing: up to `maxCovers`. */
  onlineMaxCovers?: number | null;
  combinationOnly: boolean;
  isActive: boolean;
};

export type SeatingRoom = { id: string; isActive: boolean; onlineBookable: boolean; sortOrder?: number };

export type SeatingCombination = {
  id: string;
  name: string;
  tableIds: string[];
  minCovers: number;
  maxCovers: number;
  priority: number;
  onlineBookable: boolean;
  isActive: boolean;
};

export type SeatingOptionKind = "table" | "combination" | "joined";

export type SeatingOption = {
  kind: SeatingOptionKind;
  /** Sorted, so the same set of tables always has the same key. */
  tableIds: string[];
  name: string;
  roomId: string;
  minCovers: number;
  maxCovers: number;
  priority: number;
  combinationId: string | null;
};

export type SeatingInput = {
  partySize: number;
  channel: Channel;
  tables: readonly SeatingTable[];
  rooms: readonly SeatingRoom[];
  adjacencies: readonly { tableAId: string; tableBId: string }[];
  combinations: readonly SeatingCombination[];
  /** Rooms the service runs in; empty or omitted means all rooms. */
  allowedRoomIds?: readonly string[];
  /** Only consider this room (guest or staff preference). */
  roomId?: string | null;
  /** Upper bound on tables pushed together automatically. */
  maxJoinedTables?: number;
};

const KIND_RANK: Record<SeatingOptionKind, number> = { table: 0, combination: 1, joined: 2 };

const byName = new Intl.Collator("it", { numeric: true, sensitivity: "base" });

export const optionKey = (tableIds: readonly string[]) => [...tableIds].sort().join("+");

export function compareOptions(roomOrder: (roomId: string) => number = () => 0) {
  return (a: SeatingOption, b: SeatingOption): number =>
    KIND_RANK[a.kind] - KIND_RANK[b.kind] ||
    b.priority - a.priority ||
    a.maxCovers - b.maxCovers ||
    a.tableIds.length - b.tableIds.length ||
    roomOrder(a.roomId) - roomOrder(b.roomId) ||
    byName.compare(a.name, b.name);
}

export function buildSeatingOptions(input: SeatingInput): SeatingOption[] {
  const { partySize, channel } = input;
  const maxJoined = input.maxJoinedTables ?? 3;
  const rooms = new Map(input.rooms.map((r) => [r.id, r]));
  const allowedRooms =
    input.allowedRoomIds && input.allowedRoomIds.length > 0 ? new Set(input.allowedRoomIds) : null;

  const eligible = new Map<string, SeatingTable>();
  for (const table of input.tables) {
    const room = rooms.get(table.roomId);
    if (!table.isActive || !room?.isActive) continue;
    if (allowedRooms && !allowedRooms.has(table.roomId)) continue;
    if (input.roomId && table.roomId !== input.roomId) continue;
    if (channel === "online" && (!table.onlineBookable || !room.onlineBookable)) continue;
    // Online, a table counts with its online capacity, alone and when joined to others.
    const onlineMax = channel === "online" ? table.onlineMaxCovers : null;
    eligible.set(table.id, onlineMax ? { ...table, maxCovers: Math.min(table.maxCovers, onlineMax) } : table);
  }

  const options = new Map<string, SeatingOption>();

  for (const table of eligible.values()) {
    if (table.combinationOnly || partySize < table.minCovers || partySize > table.maxCovers) continue;
    options.set(optionKey([table.id]), {
      kind: "table",
      tableIds: [table.id],
      name: table.name,
      roomId: table.roomId,
      minCovers: table.minCovers,
      maxCovers: table.maxCovers,
      priority: table.priority,
      combinationId: null,
    });
  }

  for (const combo of input.combinations) {
    if (!combo.isActive || (channel === "online" && !combo.onlineBookable)) continue;
    if (partySize < combo.minCovers || partySize > combo.maxCovers) continue;
    const members = combo.tableIds.map((id) => eligible.get(id));
    if (members.length === 0 || members.some((m) => m === undefined)) continue;
    const key = optionKey(combo.tableIds);
    if (options.has(key)) continue;
    options.set(key, {
      kind: "combination",
      tableIds: [...combo.tableIds].sort(),
      name: combo.name,
      roomId: members[0]!.roomId,
      minCovers: combo.minCovers,
      maxCovers: combo.maxCovers,
      priority: combo.priority,
      combinationId: combo.id,
    });
  }

  for (const group of joinableGroups(eligible, input.adjacencies, maxJoined)) {
    const capacity = group.reduce((sum, t) => sum + t.maxCovers, 0);
    if (capacity < partySize) continue;
    // Only minimal groups: if the party still fits after removing any table, that table isn't needed.
    if (group.some((t) => capacity - t.maxCovers >= partySize)) continue;
    const key = optionKey(group.map((t) => t.id));
    if (options.has(key)) continue;
    const names = group.map((t) => t.name).sort(byName.compare);
    options.set(key, {
      kind: "joined",
      tableIds: group.map((t) => t.id).sort(),
      name: names.join("+"),
      roomId: group[0]!.roomId,
      minCovers: Math.max(...group.map((t) => t.maxCovers)) + 1,
      maxCovers: capacity,
      priority: Math.round((group.reduce((sum, t) => sum + t.priority, 0) / group.length) * 100) / 100,
      combinationId: null,
    });
  }

  return [...options.values()].sort(compareOptions((roomId) => rooms.get(roomId)?.sortOrder ?? 0));
}

/** Connected sets of 2..maxSize adjacent tables in the same room. */
function joinableGroups(
  tables: ReadonlyMap<string, SeatingTable>,
  adjacencies: readonly { tableAId: string; tableBId: string }[],
  maxSize: number,
): SeatingTable[][] {
  const neighbors = new Map<string, Set<string>>();
  for (const { tableAId, tableBId } of adjacencies) {
    const a = tables.get(tableAId);
    const b = tables.get(tableBId);
    if (!a || !b || a.roomId !== b.roomId) continue;
    if (!neighbors.has(a.id)) neighbors.set(a.id, new Set());
    if (!neighbors.has(b.id)) neighbors.set(b.id, new Set());
    neighbors.get(a.id)!.add(b.id);
    neighbors.get(b.id)!.add(a.id);
  }

  const seen = new Set<string>();
  const groups: SeatingTable[][] = [];
  let frontier: string[][] = [...neighbors.keys()].map((id) => [id]);

  for (let size = 2; size <= maxSize && frontier.length > 0; size++) {
    const next: string[][] = [];
    for (const group of frontier) {
      for (const member of group) {
        for (const neighbor of neighbors.get(member) ?? []) {
          if (group.includes(neighbor)) continue;
          const grown = [...group, neighbor].sort();
          const key = grown.join("+");
          if (seen.has(key)) continue;
          seen.add(key);
          next.push(grown);
          groups.push(grown.map((id) => tables.get(id)!));
        }
      }
    }
    frontier = next;
  }
  return groups;
}
