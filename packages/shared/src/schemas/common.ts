import { z } from "zod";
import { isTimeString, isValidTimeZone } from "../time.js";

export const id = z.uuid();

export const timeString = z
  .string()
  .refine(isTimeString, { message: "Orario non valido, usa il formato HH:MM" });

export const dateString = z.iso.date({ message: "Data non valida, usa il formato YYYY-MM-DD" });

export const timeZone = z.string().refine(isValidTimeZone, { message: "Fuso orario non valido" });

export const covers = z.number().int().min(1).max(100);

export const nonEmptyName = (max: number) => z.string().trim().min(1).max(max);

export const optionalText = (max: number) => z.string().trim().max(max).nullable();

export const uniqueIds = z
  .array(id)
  .refine((ids) => new Set(ids).size === ids.length, { message: "Elementi duplicati" });

/** Adds an issue when a min/max pair is inverted. Shared by tables, combinations and rules. */
export function checkMinMax(
  ctx: z.RefinementCtx,
  min: number | null | undefined,
  max: number | null | undefined,
  path: string,
) {
  if (min != null && max != null && min > max) {
    ctx.addIssue({ code: "custom", path: [path], message: "Il minimo non può superare il massimo" });
  }
}
