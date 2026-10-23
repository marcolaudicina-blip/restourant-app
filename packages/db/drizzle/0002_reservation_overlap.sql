-- A table can never be held by two overlapping blocking reservations.
-- btree_gist lets a GiST index compare uuids with "=" alongside the range overlap "&&".
CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint
ALTER TABLE "reservation_tables"
  ADD CONSTRAINT "reservation_tables_no_overlap"
  EXCLUDE USING gist ("table_id" WITH =, tstzrange("starts_at", "ends_at", '[)') WITH &&)
  WHERE ("blocking");--> statement-breakpoint
ALTER TABLE "reservation_tables"
  ADD CONSTRAINT "reservation_tables_window" CHECK ("ends_at" > "starts_at");
