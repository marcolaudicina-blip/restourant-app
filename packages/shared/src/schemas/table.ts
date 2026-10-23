import { z } from "zod";
import { checkMinMax, covers, id, nonEmptyName } from "./common.js";

export const TABLE_SHAPES = ["round", "square", "rectangle"] as const;

export const tableFields = z.object({
  roomId: id,
  name: nonEmptyName(20),
  minCovers: covers,
  maxCovers: covers,
  /** Higher priority tables are offered first by automatic assignment. */
  priority: z.number().int().min(0).max(100),
  onlineBookable: z.boolean(),
  /** The table is never booked on its own, only as part of a combination. */
  combinationOnly: z.boolean(),
  isActive: z.boolean(),
  shape: z.enum(TABLE_SHAPES),
  /** Floor plan geometry, in abstract grid units. */
  posX: z.number().min(0).max(10_000),
  posY: z.number().min(0).max(10_000),
  width: z.number().positive().max(1_000),
  height: z.number().positive().max(1_000),
  rotation: z.number().min(0).lt(360),
});

export function checkTable(
  value: Pick<z.infer<typeof tableFields>, "minCovers" | "maxCovers">,
  ctx: z.RefinementCtx,
) {
  checkMinMax(ctx, value.minCovers, value.maxCovers, "maxCovers");
}

export const tableDefaults = {
  priority: 0,
  onlineBookable: true,
  combinationOnly: false,
  isActive: true,
  shape: "square",
  posX: 0,
  posY: 0,
  width: 2,
  height: 2,
  rotation: 0,
} as const satisfies Partial<z.infer<typeof tableFields>>;

export const tableCreateInput = tableFields.partial({
  priority: true,
  onlineBookable: true,
  combinationOnly: true,
  isActive: true,
  shape: true,
  posX: true,
  posY: true,
  width: true,
  height: true,
  rotation: true,
});
export const table = tableFields.superRefine(checkTable);
export const tableUpdate = tableFields.partial();

export type TableFields = z.infer<typeof tableFields>;
export type TableCreateInput = z.infer<typeof tableCreateInput>;
export type TableUpdate = z.infer<typeof tableUpdate>;

/** Two tables that physically touch and can be pushed together. */
export const tableAdjacency = z
  .object({ tableAId: id, tableBId: id })
  .refine((v) => v.tableAId !== v.tableBId, { message: "Un tavolo non può essere adiacente a sé stesso" });

export const tableAdjacencySet = z.object({ pairs: z.array(tableAdjacency).max(2_000) });

export type TableAdjacency = z.infer<typeof tableAdjacency>;
