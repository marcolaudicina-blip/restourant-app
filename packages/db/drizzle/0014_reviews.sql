ALTER TABLE "booking_policies" ADD COLUMN "review_requests" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "booking_policies" ADD COLUMN "review_url" text;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "review_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "rating" integer;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "feedback" text;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "rated_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "reservations_restaurant_id_rated_at_index" ON "reservations" USING btree ("restaurant_id","rated_at");--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_rating" CHECK ("reservations"."rating" between 1 and 5);