CREATE TYPE "public"."reservation_channel" AS ENUM('staff', 'online', 'walk_in');--> statement-breakpoint
CREATE TYPE "public"."reservation_status" AS ENUM('requested', 'confirmed', 'arrived', 'seated', 'completed', 'no_show', 'cancelled');--> statement-breakpoint
CREATE TABLE "reservation_tables" (
	"restaurant_id" uuid NOT NULL,
	"reservation_id" uuid NOT NULL,
	"table_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"blocking" boolean NOT NULL,
	CONSTRAINT "reservation_tables_reservation_id_table_id_pk" PRIMARY KEY("reservation_id","table_id")
);
--> statement-breakpoint
CREATE TABLE "reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"service_id" uuid,
	"date" date NOT NULL,
	"start_time" time NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"duration_minutes" integer NOT NULL,
	"party_size" integer NOT NULL,
	"status" "reservation_status" NOT NULL,
	"channel" "reservation_channel" NOT NULL,
	"guest_name" text NOT NULL,
	"guest_phone" text,
	"guest_email" text,
	"guest_note" text,
	"internal_note" text,
	"requested_room_id" uuid,
	"created_by_user_id" uuid,
	"seated_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reservations_id_restaurant_key" UNIQUE("id","restaurant_id"),
	CONSTRAINT "reservations_party_size" CHECK ("reservations"."party_size" >= 1),
	CONSTRAINT "reservations_window" CHECK ("reservations"."ends_at" > "reservations"."starts_at")
);
--> statement-breakpoint
ALTER TABLE "table_combinations" ADD COLUMN "priority" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "reservation_tables" ADD CONSTRAINT "reservation_tables_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_tables" ADD CONSTRAINT "reservation_tables_reservation_id_restaurant_id_reservations_id_restaurant_id_fk" FOREIGN KEY ("reservation_id","restaurant_id") REFERENCES "public"."reservations"("id","restaurant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_tables" ADD CONSTRAINT "reservation_tables_table_id_restaurant_id_tables_id_restaurant_id_fk" FOREIGN KEY ("table_id","restaurant_id") REFERENCES "public"."tables"("id","restaurant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_requested_room_id_rooms_id_fk" FOREIGN KEY ("requested_room_id") REFERENCES "public"."rooms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_service_id_restaurant_id_services_id_restaurant_id_fk" FOREIGN KEY ("service_id","restaurant_id") REFERENCES "public"."services"("id","restaurant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reservation_tables_table_id_starts_at_index" ON "reservation_tables" USING btree ("table_id","starts_at");--> statement-breakpoint
CREATE INDEX "reservations_restaurant_id_date_index" ON "reservations" USING btree ("restaurant_id","date");--> statement-breakpoint
CREATE INDEX "reservations_restaurant_id_starts_at_index" ON "reservations" USING btree ("restaurant_id","starts_at");