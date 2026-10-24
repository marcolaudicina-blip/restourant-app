CREATE TYPE "public"."waitlist_channel" AS ENUM('staff', 'online');--> statement-breakpoint
CREATE TYPE "public"."waitlist_status" AS ENUM('waiting', 'notified', 'booked', 'removed');--> statement-breakpoint
CREATE TABLE "waitlist_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"date" date NOT NULL,
	"party_size" integer NOT NULL,
	"time_from" time,
	"time_to" time,
	"guest_name" text NOT NULL,
	"guest_phone" text,
	"phone_normalized" text,
	"guest_email" text,
	"note" text,
	"channel" "waitlist_channel" NOT NULL,
	"status" "waitlist_status" DEFAULT 'waiting' NOT NULL,
	"locale" "locale" DEFAULT 'it' NOT NULL,
	"notified_at" timestamp with time zone,
	"reservation_id" uuid,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "waitlist_entries_party_size" CHECK ("waitlist_entries"."party_size" >= 1)
);
--> statement-breakpoint
ALTER TABLE "booking_policies" ADD COLUMN "waitlist_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_reservation_id_restaurant_id_reservations_id_restaurant_id_fk" FOREIGN KEY ("reservation_id","restaurant_id") REFERENCES "public"."reservations"("id","restaurant_id") ON DELETE set null ("reservation_id") ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "waitlist_entries_restaurant_id_date_index" ON "waitlist_entries" USING btree ("restaurant_id","date");--> statement-breakpoint
CREATE INDEX "waitlist_entries_restaurant_id_updated_at_index" ON "waitlist_entries" USING btree ("restaurant_id","updated_at");