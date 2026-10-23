import type { BookingPolicy } from "./schemas/booking-policy.js";
import type { ServiceCreateInput } from "./schemas/service.js";
import type { TableFields } from "./schemas/table.js";

/**
 * Starter setups for the onboarding wizard. A new restaurant picks the closest one and then
 * renames tables, moves them on the floor plan and tweaks hours, instead of starting from zero.
 * Tables are referenced by name, so names must be unique within a template.
 */
export type TemplateTable = Pick<TableFields, "name" | "minCovers" | "maxCovers"> &
  Partial<Pick<TableFields, "shape" | "combinationOnly">>;

export type ConfigTemplate = {
  key: string;
  name: string;
  description: string;
  policy: Partial<BookingPolicy>;
  rooms: { name: string; guestSelectable?: boolean; tables: TemplateTable[] }[];
  adjacencies: [string, string][];
  services: (Omit<ServiceCreateInput, "roomIds"> & { rooms?: string[] })[];
  durationRules: { minParty: number; maxParty: number; durationMinutes: number }[];
};

const range = (prefix: string, from: number, to: number, table: Omit<TemplateTable, "name">) =>
  Array.from({ length: to - from + 1 }, (_, i): TemplateTable => ({
    name: `${prefix}${from + i}`,
    ...table,
  }));

const TUE_TO_SUN = [2, 3, 4, 5, 6, 7];
const EVERY_DAY = [1, 2, 3, 4, 5, 6, 7];

export const CONFIG_TEMPLATES = [
  {
    key: "trattoria",
    name: "Trattoria / ristorante classico",
    description: "Circa 50 coperti tra sala e dehors, pranzo e cena con arrivi ogni 15 minuti.",
    policy: {},
    rooms: [
      {
        name: "Sala",
        tables: [
          ...range("T", 1, 6, { minCovers: 1, maxCovers: 2, shape: "round" }),
          ...range("T", 7, 12, { minCovers: 2, maxCovers: 4, shape: "square" }),
        ],
      },
      { name: "Dehors", guestSelectable: true, tables: range("D", 1, 4, { minCovers: 2, maxCovers: 4 }) },
    ],
    adjacencies: [
      ["T1", "T2"],
      ["T3", "T4"],
      ["T5", "T6"],
      ["T7", "T8"],
      ["T8", "T9"],
      ["T10", "T11"],
      ["T11", "T12"],
      ["D1", "D2"],
      ["D3", "D4"],
    ],
    services: [
      { name: "Pranzo", daysOfWeek: TUE_TO_SUN, firstArrival: "12:00", lastArrival: "14:30", sortOrder: 0 },
      { name: "Cena", daysOfWeek: TUE_TO_SUN, firstArrival: "19:00", lastArrival: "22:30", sortOrder: 1 },
    ],
    durationRules: [
      { minParty: 1, maxParty: 2, durationMinutes: 90 },
      { minParty: 3, maxParty: 4, durationMinutes: 105 },
      { minParty: 5, maxParty: 8, durationMinutes: 120 },
      { minParty: 9, maxParty: 100, durationMinutes: 150 },
    ],
  },
  {
    key: "pizzeria_turni",
    name: "Pizzeria a doppio turno",
    description: "Cena tutti i giorni con turni fissi alle 19:30 e alle 21:30, pranzo nel weekend.",
    policy: { maxPartyOnline: 10 },
    rooms: [
      {
        name: "Sala",
        tables: [
          ...range("P", 1, 10, { minCovers: 2, maxCovers: 4 }),
          ...range("P", 11, 14, { minCovers: 4, maxCovers: 6, shape: "rectangle" }),
        ],
      },
    ],
    adjacencies: [
      ["P1", "P2"],
      ["P2", "P3"],
      ["P4", "P5"],
      ["P6", "P7"],
      ["P8", "P9"],
      ["P11", "P12"],
      ["P13", "P14"],
    ],
    services: [
      { name: "Pranzo", daysOfWeek: [6, 7], firstArrival: "12:30", lastArrival: "14:00", sortOrder: 0 },
      {
        name: "Cena",
        daysOfWeek: EVERY_DAY,
        firstArrival: "19:30",
        lastArrival: "21:30",
        seatingMode: "fixed",
        fixedSeatings: ["19:30", "21:30"],
        sortOrder: 1,
      },
    ],
    durationRules: [
      { minParty: 1, maxParty: 4, durationMinutes: 105 },
      { minParty: 5, maxParty: 100, durationMinutes: 120 },
    ],
  },
  {
    key: "fine_dining",
    name: "Fine dining / degustazione",
    description: "Sola cena da mercoledì a sabato, arrivi ogni 30 minuti con ritmo controllato.",
    policy: {
      maxPartyOnline: 6,
      minNoticeMinutes: 240,
      confirmationMode: "auto_up_to",
      autoConfirmMaxParty: 4,
      cancellationNoticeHours: 48,
    },
    rooms: [
      {
        name: "Sala",
        tables: [
          ...range("F", 1, 8, { minCovers: 1, maxCovers: 2, shape: "round" }),
          ...range("F", 9, 10, { minCovers: 3, maxCovers: 4 }),
          { name: "F11", minCovers: 5, maxCovers: 8, shape: "round" },
        ],
      },
    ],
    adjacencies: [],
    services: [
      {
        name: "Cena",
        daysOfWeek: [3, 4, 5, 6],
        firstArrival: "19:30",
        lastArrival: "21:30",
        slotIntervalMinutes: 30,
        maxCoversPerSlot: 12,
        sortOrder: 0,
      },
    ],
    durationRules: [
      { minParty: 1, maxParty: 2, durationMinutes: 150 },
      { minParty: 3, maxParty: 4, durationMinutes: 165 },
      { minParty: 5, maxParty: 100, durationMinutes: 180 },
    ],
  },
] as const satisfies readonly ConfigTemplate[];

export type ConfigTemplateKey = (typeof CONFIG_TEMPLATES)[number]["key"];

export const CONFIG_TEMPLATE_KEYS = CONFIG_TEMPLATES.map((t) => t.key) as [
  ConfigTemplateKey,
  ...ConfigTemplateKey[],
];

export function getConfigTemplate(key: string): ConfigTemplate | undefined {
  return CONFIG_TEMPLATES.find((t) => t.key === key) as ConfigTemplate | undefined;
}

/** Simple grid layout so a freshly applied template is readable on the floor plan. */
export function gridPosition(index: number, perRow = 6, spacing = 3): { posX: number; posY: number } {
  return { posX: (index % perRow) * spacing, posY: Math.floor(index / perRow) * spacing };
}
