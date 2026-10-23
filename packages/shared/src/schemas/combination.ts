import { z } from "zod";
import { checkMinMax, covers, nonEmptyName, uniqueIds } from "./common.js";

export const combinationFields = z.object({
  name: nonEmptyName(40),
  tableIds: uniqueIds.min(2, { message: "Una combinazione richiede almeno due tavoli" }).max(12),
  minCovers: covers,
  maxCovers: covers,
  /** Same scale as table priority: higher is offered first. */
  priority: z.number().int().min(0).max(100),
  onlineBookable: z.boolean(),
  isActive: z.boolean(),
});

export function checkCombination(
  value: Pick<z.infer<typeof combinationFields>, "minCovers" | "maxCovers">,
  ctx: z.RefinementCtx,
) {
  checkMinMax(ctx, value.minCovers, value.maxCovers, "maxCovers");
}

export const combinationCreateInput = combinationFields.partial({
  priority: true,
  onlineBookable: true,
  isActive: true,
});
export const combination = combinationFields.superRefine(checkCombination);
export const combinationUpdate = combinationFields.partial();

export type CombinationFields = z.infer<typeof combinationFields>;
export type CombinationCreateInput = z.infer<typeof combinationCreateInput>;
export type CombinationUpdate = z.infer<typeof combinationUpdate>;

export const combinationDefaults = {
  priority: 0,
  onlineBookable: true,
  isActive: true,
} as const satisfies Partial<CombinationFields>;
