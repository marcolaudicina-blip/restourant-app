import { z } from "zod";
import { password } from "./auth.js";
import { nonEmptyName } from "./common.js";

/** Roles that can be given to a colleague. There is one owner per restaurant: whoever created it. */
export const INVITABLE_ROLES = ["manager", "staff"] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];

const email = z.email({ message: "Email non valida" }).transform((v) => v.toLowerCase());

export const invitationInput = z.object({ email, role: z.enum(INVITABLE_ROLES) });
export const memberRoleInput = z.object({ role: z.enum(INVITABLE_ROLES) });

/** New accounts send name and a new password; existing accounts confirm with their password. */
export const acceptInvitationInput = z.object({
  fullName: nonEmptyName(120).optional(),
  password: z.string().min(1).max(200),
});

export const forgotPasswordInput = z.object({ email });
export const resetPasswordInput = z.object({ token: z.string().min(20).max(200), password });
export const changePasswordInput = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: password,
});

export type InvitationInput = z.infer<typeof invitationInput>;
export type AcceptInvitationInput = z.infer<typeof acceptInvitationInput>;
