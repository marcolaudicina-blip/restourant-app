import { z } from "zod";
import { nonEmptyName } from "./common.js";

export const ROLES = ["owner", "manager", "staff"] as const;
export type Role = (typeof ROLES)[number];

export const password = z
  .string()
  .min(10, { message: "La password deve avere almeno 10 caratteri" })
  .max(200);

export const registerInput = z.object({
  email: z.email().transform((v) => v.toLowerCase()),
  password,
  fullName: nonEmptyName(120),
  restaurantName: nonEmptyName(120),
});

export const loginInput = z.object({
  email: z.email().transform((v) => v.toLowerCase()),
  password: z.string().min(1).max(200),
});

export type RegisterInput = z.infer<typeof registerInput>;
export type LoginInput = z.infer<typeof loginInput>;
