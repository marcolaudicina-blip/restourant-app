import { bookingPages, media, restaurants } from "@restourant/db";
import {
  bookingPageFields,
  DEFAULT_BRAND_COLOR,
  MAX_MEDIA_BYTES,
  type BookingPageFields,
  type BookingPageUpdate,
  type MediaType,
  type MediaUpload,
} from "@restourant/shared";
import { and, count, eq, inArray, lt, notInArray, or } from "drizzle-orm";
import type { Database } from "@restourant/db";
import { recordAudit } from "../../lib/audit.js";
import { inTransaction, type TenantContext } from "../../lib/context.js";
import {
  conflict,
  invalid,
  notFound,
  pgErrorCode,
  PG_UNIQUE_VIOLATION,
  validateEntity,
} from "../../lib/errors.js";
import { definedOnly } from "../../lib/http.js";

export type BookingPage = BookingPageFields;

/** Uploads not used by the page after this long are deleted on the next save. */
const ORPHAN_MEDIA_MS = 24 * 60 * 60 * 1000;
/** Stops a single restaurant from filling the database with pictures. */
const MAX_MEDIA_PER_RESTAURANT = 40;

export async function getBookingPage(ctx: TenantContext): Promise<BookingPage> {
  const [[restaurant], [page]] = await Promise.all([
    ctx.db
      .select({ slug: restaurants.slug })
      .from(restaurants)
      .where(eq(restaurants.id, ctx.restaurantId))
      .limit(1),
    ctx.db.select().from(bookingPages).where(eq(bookingPages.restaurantId, ctx.restaurantId)).limit(1),
  ]);
  if (!restaurant) throw notFound("Ristorante");
  return {
    slug: restaurant.slug,
    brandColor: page?.brandColor ?? DEFAULT_BRAND_COLOR,
    description: page?.description ?? null,
    confirmationNote: page?.confirmationNote ?? null,
    logoId: page?.logoId ?? null,
    coverId: page?.coverId ?? null,
    photoIds: page?.photoIds ?? [],
  };
}

const imagesOf = (page: BookingPage) =>
  [page.logoId, page.coverId, ...page.photoIds].filter((id): id is string => id !== null);

export async function updateBookingPage(
  ctx: TenantContext,
  patch: BookingPageUpdate,
  now: Date,
): Promise<BookingPage> {
  const current = await getBookingPage(ctx);
  const changes = definedOnly(patch);
  const next = validateEntity(bookingPageFields, { ...current, ...changes });

  const used = imagesOf(next);
  if (used.length > 0) {
    const owned = await ctx.db
      .select({ id: media.id })
      .from(media)
      .where(and(eq(media.restaurantId, ctx.restaurantId), inArray(media.id, used)));
    const missing = used.filter((id) => !owned.some((m) => m.id === id));
    if (missing.length > 0) {
      throw invalid(
        "Immagine non trovata",
        missing.map((id) => ({ path: "photoIds", message: id })),
      );
    }
  }

  await inTransaction(ctx, async (tx) => {
    if (next.slug !== current.slug) {
      try {
        await tx.db.update(restaurants).set({ slug: next.slug }).where(eq(restaurants.id, ctx.restaurantId));
      } catch (error) {
        if (pgErrorCode(error) === PG_UNIQUE_VIOLATION) {
          throw conflict(
            "slug_taken",
            "Questo indirizzo è già usato da un altro ristorante: scegline un altro",
          );
        }
        throw error;
      }
    }
    const { slug: _slug, ...page } = next;
    await tx.db
      .insert(bookingPages)
      .values({ restaurantId: ctx.restaurantId, ...page })
      .onConflictDoUpdate({ target: bookingPages.restaurantId, set: page });

    // Pictures the page no longer shows, and uploads that were never saved.
    const replaced = imagesOf(current).filter((id) => !used.includes(id));
    await tx.db
      .delete(media)
      .where(
        and(
          eq(media.restaurantId, ctx.restaurantId),
          used.length > 0 ? notInArray(media.id, used) : undefined,
          or(
            replaced.length > 0 ? inArray(media.id, replaced) : undefined,
            lt(media.createdAt, new Date(now.getTime() - ORPHAN_MEDIA_MS)),
          ),
        ),
      );
    await recordAudit(tx, { entity: "booking_page", entityId: ctx.restaurantId, action: "update", changes });
  });
  return getBookingPage(ctx);
}

/** First bytes of each accepted format, so a file can't pretend to be an image. */
function sniff(bytes: Uint8Array): MediaType | null {
  const starts = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (starts(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}

export async function uploadMedia(ctx: TenantContext, upload: MediaUpload): Promise<{ id: string }> {
  const [, declared, base64] = /^data:(image\/[a-z]+);base64,(.+)$/.exec(upload.dataUrl) ?? [];
  const bytes = Buffer.from(base64 ?? "", "base64");
  const contentType = sniff(bytes);
  if (!contentType || contentType !== declared) {
    throw invalid("Il file non è un'immagine JPG, PNG o WebP valida");
  }
  if (bytes.byteLength > MAX_MEDIA_BYTES) throw invalid("Immagine troppo grande (max 3 MB)");

  const [stored] = await ctx.db
    .select({ n: count() })
    .from(media)
    .where(eq(media.restaurantId, ctx.restaurantId));
  if ((stored?.n ?? 0) >= MAX_MEDIA_PER_RESTAURANT) {
    throw conflict("too_many_images", "Troppe immagini caricate: salva la pagina e riprova");
  }

  return inTransaction(ctx, async (tx) => {
    const [row] = await tx.db
      .insert(media)
      .values({ restaurantId: ctx.restaurantId, contentType, byteSize: bytes.byteLength, data: bytes })
      .returning({ id: media.id });
    await recordAudit(tx, {
      entity: "media",
      entityId: row!.id,
      action: "create",
      changes: { contentType, byteSize: bytes.byteLength },
    });
    return { id: row!.id };
  });
}

/** An uploaded picture, for the public image route. Ids are random, so no tenant check is needed. */
export async function getMedia(db: Database, id: string): Promise<{ contentType: string; data: Buffer }> {
  const [row] = await db
    .select({ contentType: media.contentType, data: media.data })
    .from(media)
    .where(eq(media.id, id))
    .limit(1);
  if (!row) throw notFound("Immagine");
  return { contentType: row.contentType, data: Buffer.from(row.data) };
}
