import { z } from "zod";
import { id, optionalText } from "./common.js";

/** Takes a table or a whole room out of service for a time window (events, maintenance). */
export const tableBlockFields = z.object({
  tableId: id.nullable(),
  roomId: id.nullable(),
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }),
  /** When true the block only hides the table from online booking. */
  onlineOnly: z.boolean(),
  reason: optionalText(200),
});

export function checkTableBlock(value: z.infer<typeof tableBlockFields>, ctx: z.RefinementCtx) {
  if ((value.tableId === null) === (value.roomId === null)) {
    ctx.addIssue({ code: "custom", path: ["tableId"], message: "Blocca un tavolo oppure una sala" });
  }
  if (Date.parse(value.endsAt) <= Date.parse(value.startsAt)) {
    ctx.addIssue({ code: "custom", path: ["endsAt"], message: "La fine deve essere successiva all'inizio" });
  }
}

export const tableBlockDefaults = {
  tableId: null,
  roomId: null,
  onlineOnly: false,
  reason: null,
} as const satisfies Partial<z.infer<typeof tableBlockFields>>;

export const tableBlockCreateInput = tableBlockFields.partial({
  tableId: true,
  roomId: true,
  onlineOnly: true,
  reason: true,
});
export const tableBlock = tableBlockFields.superRefine(checkTableBlock);
export const tableBlockUpdate = tableBlockFields.partial();

export type TableBlockFields = z.infer<typeof tableBlockFields>;
export type TableBlockCreateInput = z.infer<typeof tableBlockCreateInput>;
export type TableBlockUpdate = z.infer<typeof tableBlockUpdate>;
