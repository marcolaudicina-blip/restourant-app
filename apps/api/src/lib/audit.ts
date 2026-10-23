import { auditLog } from "@restourant/db";
import type { TenantContext } from "./context.js";

export type AuditAction = "create" | "update" | "delete" | "replace" | "apply_template";

export async function recordAudit(
  ctx: TenantContext,
  entry: { entity: string; entityId?: string | null; action: AuditAction; changes?: unknown },
): Promise<void> {
  await ctx.db.insert(auditLog).values({
    restaurantId: ctx.restaurantId,
    actorUserId: ctx.actorUserId,
    entity: entry.entity,
    entityId: entry.entityId ?? null,
    action: entry.action,
    changes: entry.changes ?? null,
  });
}
