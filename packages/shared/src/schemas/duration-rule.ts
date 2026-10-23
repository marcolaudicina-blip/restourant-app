import { z } from "zod";
import { checkMinMax, covers, id } from "./common.js";

/**
 * How long a table stays occupied. Rules can be narrowed to a service and/or a room;
 * the most specific matching rule wins (see `resolveDuration`).
 */
export const durationRuleFields = z.object({
  serviceId: id.nullable(),
  roomId: id.nullable(),
  minParty: covers,
  maxParty: covers,
  durationMinutes: z.number().int().min(15).max(600),
});

export function checkDurationRule(value: z.infer<typeof durationRuleFields>, ctx: z.RefinementCtx) {
  checkMinMax(ctx, value.minParty, value.maxParty, "maxParty");
}

export const durationRuleCreateInput = durationRuleFields.partial({ serviceId: true, roomId: true });
export const durationRule = durationRuleFields.superRefine(checkDurationRule);
export const durationRuleUpdate = durationRuleFields.partial();

export const durationRuleDefaults = { serviceId: null, roomId: null } as const;

export type DurationRuleFields = z.infer<typeof durationRuleFields>;
export type DurationRuleCreateInput = z.infer<typeof durationRuleCreateInput>;
export type DurationRuleUpdate = z.infer<typeof durationRuleUpdate>;
