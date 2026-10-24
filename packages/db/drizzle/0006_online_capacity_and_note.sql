ALTER TABLE "tables" ADD COLUMN "online_max_covers" integer;--> statement-breakpoint
ALTER TABLE "booking_pages" ADD COLUMN "confirmation_note" text;--> statement-breakpoint
ALTER TABLE "tables" ADD CONSTRAINT "tables_online_covers_range" CHECK ("tables"."online_max_covers" is null or "tables"."online_max_covers" between "tables"."min_covers" and "tables"."max_covers");