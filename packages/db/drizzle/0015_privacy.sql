ALTER TABLE "booking_policies" ADD COLUMN "guest_retention_months" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "terms_accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "terms_version" text;--> statement-breakpoint
ALTER TABLE "booking_pages" ADD COLUMN "privacy_url" text;