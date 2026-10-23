import type { DurationRuleFields } from "./schemas/duration-rule.js";

export type DurationQuery = {
  partySize: number;
  serviceId: string | null;
  roomId: string | null;
};

/**
 * Picks the table duration for a party. Among rules whose party range contains the size and whose
 * service/room filters match, the most specific wins: service+room > service > room > generic.
 * Ties go to the narrowest party range. Falls back to the restaurant default.
 */
export function resolveDuration(
  rules: readonly DurationRuleFields[],
  query: DurationQuery,
  defaultMinutes: number,
): number {
  let best: { rule: DurationRuleFields; specificity: number; width: number } | null = null;

  for (const rule of rules) {
    if (query.partySize < rule.minParty || query.partySize > rule.maxParty) continue;
    if (rule.serviceId !== null && rule.serviceId !== query.serviceId) continue;
    if (rule.roomId !== null && rule.roomId !== query.roomId) continue;

    const specificity = (rule.serviceId !== null ? 2 : 0) + (rule.roomId !== null ? 1 : 0);
    const width = rule.maxParty - rule.minParty;
    if (!best || specificity > best.specificity || (specificity === best.specificity && width < best.width)) {
      best = { rule, specificity, width };
    }
  }

  return best?.rule.durationMinutes ?? defaultMinutes;
}
