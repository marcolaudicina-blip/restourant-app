CREATE TABLE "guests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"phone" text,
	"phone_normalized" text,
	"email" text,
	"profile_note" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"marketing_consent" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guests_id_restaurant_key" UNIQUE("id","restaurant_id")
);
--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "guest_id" uuid;--> statement-breakpoint
ALTER TABLE "guests" ADD CONSTRAINT "guests_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "guests_restaurant_phone_idx" ON "guests" USING btree ("restaurant_id","phone_normalized") WHERE "guests"."phone_normalized" is not null;--> statement-breakpoint
CREATE INDEX "guests_restaurant_email_idx" ON "guests" USING btree ("restaurant_id",lower("email"));--> statement-breakpoint
CREATE INDEX "guests_restaurant_name_idx" ON "guests" USING btree ("restaurant_id",lower("full_name"));--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_guest_id_restaurant_id_guests_id_restaurant_id_fk" FOREIGN KEY ("guest_id","restaurant_id") REFERENCES "public"."guests"("id","restaurant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reservations_guest_id_index" ON "reservations" USING btree ("guest_id");