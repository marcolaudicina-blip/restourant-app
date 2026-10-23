CREATE TYPE "public"."confirmation_mode" AS ENUM('auto', 'manual', 'auto_up_to');--> statement-breakpoint
CREATE TYPE "public"."exception_kind" AS ENUM('closed', 'special_hours');--> statement-breakpoint
CREATE TYPE "public"."exception_scope" AS ENUM('all', 'online');--> statement-breakpoint
CREATE TYPE "public"."large_party_mode" AS ENUM('request', 'phone_only');--> statement-breakpoint
CREATE TYPE "public"."locale" AS ENUM('it', 'en');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('owner', 'manager', 'staff');--> statement-breakpoint
CREATE TYPE "public"."seating_mode" AS ENUM('continuous', 'fixed');--> statement-breakpoint
CREATE TYPE "public"."table_shape" AS ENUM('round', 'square', 'rectangle');--> statement-breakpoint
CREATE TABLE "booking_policies" (
	"restaurant_id" uuid PRIMARY KEY NOT NULL,
	"online_enabled" boolean NOT NULL,
	"min_party_online" integer NOT NULL,
	"max_party_online" integer NOT NULL,
	"large_party_mode" "large_party_mode" NOT NULL,
	"min_notice_minutes" integer NOT NULL,
	"max_advance_days" integer NOT NULL,
	"confirmation_mode" "confirmation_mode" NOT NULL,
	"auto_confirm_max_party" integer,
	"guest_can_cancel" boolean NOT NULL,
	"guest_can_modify" boolean NOT NULL,
	"cancellation_notice_hours" integer NOT NULL,
	"slot_interval_minutes" integer NOT NULL,
	"default_duration_minutes" integer NOT NULL,
	"require_phone" boolean NOT NULL,
	"require_email" boolean NOT NULL,
	"policy_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_policies_party_range" CHECK ("booking_policies"."min_party_online" <= "booking_policies"."max_party_online"),
	CONSTRAINT "booking_policies_contact_required" CHECK ("booking_policies"."require_phone" or "booking_policies"."require_email")
);
--> statement-breakpoint
CREATE TABLE "restaurants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"timezone" text DEFAULT 'Europe/Rome' NOT NULL,
	"locale" "locale" DEFAULT 'it' NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"phone" text,
	"email" text,
	"website" text,
	"address_line" text,
	"city" text,
	"postal_code" text,
	"country" text DEFAULT 'IT' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "restaurants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"user_id" uuid NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"role" "role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_user_id_restaurant_id_pk" PRIMARY KEY("user_id","restaurant_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"full_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"name" text NOT NULL,
	"min_covers" integer NOT NULL,
	"max_covers" integer NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"online_bookable" boolean DEFAULT true NOT NULL,
	"combination_only" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"shape" "table_shape" DEFAULT 'square' NOT NULL,
	"pos_x" real DEFAULT 0 NOT NULL,
	"pos_y" real DEFAULT 0 NOT NULL,
	"width" real DEFAULT 2 NOT NULL,
	"height" real DEFAULT 2 NOT NULL,
	"rotation" real DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tables_restaurantId_name_unique" UNIQUE("restaurant_id","name"),
	CONSTRAINT "tables_id_restaurant_key" UNIQUE("id","restaurant_id"),
	CONSTRAINT "tables_covers_range" CHECK ("tables"."min_covers" >= 1 and "tables"."min_covers" <= "tables"."max_covers")
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"online_bookable" boolean DEFAULT true NOT NULL,
	"guest_selectable" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rooms_restaurantId_name_unique" UNIQUE("restaurant_id","name"),
	CONSTRAINT "rooms_id_restaurant_key" UNIQUE("id","restaurant_id")
);
--> statement-breakpoint
CREATE TABLE "table_adjacencies" (
	"restaurant_id" uuid NOT NULL,
	"table_a_id" uuid NOT NULL,
	"table_b_id" uuid NOT NULL,
	CONSTRAINT "table_adjacencies_table_a_id_table_b_id_pk" PRIMARY KEY("table_a_id","table_b_id"),
	CONSTRAINT "table_adjacencies_ordered" CHECK ("table_adjacencies"."table_a_id" < "table_adjacencies"."table_b_id")
);
--> statement-breakpoint
CREATE TABLE "table_combination_members" (
	"restaurant_id" uuid NOT NULL,
	"combination_id" uuid NOT NULL,
	"table_id" uuid NOT NULL,
	CONSTRAINT "table_combination_members_combination_id_table_id_pk" PRIMARY KEY("combination_id","table_id")
);
--> statement-breakpoint
CREATE TABLE "table_combinations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"min_covers" integer NOT NULL,
	"max_covers" integer NOT NULL,
	"online_bookable" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "table_combinations_restaurantId_name_unique" UNIQUE("restaurant_id","name"),
	CONSTRAINT "table_combinations_id_restaurant_key" UNIQUE("id","restaurant_id"),
	CONSTRAINT "table_combinations_covers_range" CHECK ("table_combinations"."min_covers" >= 1 and "table_combinations"."min_covers" <= "table_combinations"."max_covers")
);
--> statement-breakpoint
CREATE TABLE "calendar_exceptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"kind" "exception_kind" NOT NULL,
	"scope" "exception_scope" DEFAULT 'all' NOT NULL,
	"date_from" date NOT NULL,
	"date_to" date NOT NULL,
	"service_id" uuid,
	"first_arrival" time,
	"last_arrival" time,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_exceptions_dates" CHECK ("calendar_exceptions"."date_from" <= "calendar_exceptions"."date_to"),
	CONSTRAINT "calendar_exceptions_special_hours" CHECK ("calendar_exceptions"."kind" <> 'special_hours' or ("calendar_exceptions"."service_id" is not null and "calendar_exceptions"."first_arrival" is not null and "calendar_exceptions"."last_arrival" >= "calendar_exceptions"."first_arrival"))
);
--> statement-breakpoint
CREATE TABLE "duration_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"service_id" uuid,
	"room_id" uuid,
	"min_party" integer NOT NULL,
	"max_party" integer NOT NULL,
	"duration_minutes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "duration_rules_party_range" CHECK ("duration_rules"."min_party" >= 1 and "duration_rules"."min_party" <= "duration_rules"."max_party"),
	CONSTRAINT "duration_rules_duration" CHECK ("duration_rules"."duration_minutes" between 15 and 600)
);
--> statement-breakpoint
CREATE TABLE "service_rooms" (
	"restaurant_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	CONSTRAINT "service_rooms_service_id_room_id_pk" PRIMARY KEY("service_id","room_id")
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"days_of_week" smallint[] NOT NULL,
	"first_arrival" time NOT NULL,
	"last_arrival" time NOT NULL,
	"seating_mode" "seating_mode" DEFAULT 'continuous' NOT NULL,
	"slot_interval_minutes" integer,
	"fixed_seatings" time[] DEFAULT '{}'::time[] NOT NULL,
	"valid_from" date,
	"valid_to" date,
	"max_covers" integer,
	"max_covers_per_slot" integer,
	"max_bookings_per_slot" integer,
	"online_bookable" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "services_restaurantId_name_unique" UNIQUE("restaurant_id","name"),
	CONSTRAINT "services_id_restaurant_key" UNIQUE("id","restaurant_id"),
	CONSTRAINT "services_arrival_window" CHECK ("services"."last_arrival" >= "services"."first_arrival"),
	CONSTRAINT "services_days_of_week" CHECK (cardinality("services"."days_of_week") >= 1 and "services"."days_of_week" <@ array[1,2,3,4,5,6,7]::smallint[]),
	CONSTRAINT "services_season" CHECK ("services"."valid_from" is null or "services"."valid_to" is null or "services"."valid_from" <= "services"."valid_to")
);
--> statement-breakpoint
CREATE TABLE "table_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"table_id" uuid,
	"room_id" uuid,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"online_only" boolean DEFAULT false NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "table_blocks_target" CHECK (num_nonnulls("table_blocks"."table_id", "table_blocks"."room_id") = 1),
	CONSTRAINT "table_blocks_window" CHECK ("table_blocks"."ends_at" > "table_blocks"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"entity" text NOT NULL,
	"entity_id" uuid,
	"action" text NOT NULL,
	"changes" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "booking_policies" ADD CONSTRAINT "booking_policies_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tables" ADD CONSTRAINT "tables_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tables" ADD CONSTRAINT "tables_room_id_restaurant_id_rooms_id_restaurant_id_fk" FOREIGN KEY ("room_id","restaurant_id") REFERENCES "public"."rooms"("id","restaurant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_adjacencies" ADD CONSTRAINT "table_adjacencies_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_adjacencies" ADD CONSTRAINT "table_adjacencies_table_a_id_restaurant_id_tables_id_restaurant_id_fk" FOREIGN KEY ("table_a_id","restaurant_id") REFERENCES "public"."tables"("id","restaurant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_adjacencies" ADD CONSTRAINT "table_adjacencies_table_b_id_restaurant_id_tables_id_restaurant_id_fk" FOREIGN KEY ("table_b_id","restaurant_id") REFERENCES "public"."tables"("id","restaurant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_combination_members" ADD CONSTRAINT "table_combination_members_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_combination_members" ADD CONSTRAINT "table_combination_members_combination_id_restaurant_id_table_combinations_id_restaurant_id_fk" FOREIGN KEY ("combination_id","restaurant_id") REFERENCES "public"."table_combinations"("id","restaurant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_combination_members" ADD CONSTRAINT "table_combination_members_table_id_restaurant_id_tables_id_restaurant_id_fk" FOREIGN KEY ("table_id","restaurant_id") REFERENCES "public"."tables"("id","restaurant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_combinations" ADD CONSTRAINT "table_combinations_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_exceptions" ADD CONSTRAINT "calendar_exceptions_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_exceptions" ADD CONSTRAINT "calendar_exceptions_service_id_restaurant_id_services_id_restaurant_id_fk" FOREIGN KEY ("service_id","restaurant_id") REFERENCES "public"."services"("id","restaurant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duration_rules" ADD CONSTRAINT "duration_rules_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duration_rules" ADD CONSTRAINT "duration_rules_service_id_restaurant_id_services_id_restaurant_id_fk" FOREIGN KEY ("service_id","restaurant_id") REFERENCES "public"."services"("id","restaurant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duration_rules" ADD CONSTRAINT "duration_rules_room_id_restaurant_id_rooms_id_restaurant_id_fk" FOREIGN KEY ("room_id","restaurant_id") REFERENCES "public"."rooms"("id","restaurant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_rooms" ADD CONSTRAINT "service_rooms_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_rooms" ADD CONSTRAINT "service_rooms_service_id_restaurant_id_services_id_restaurant_id_fk" FOREIGN KEY ("service_id","restaurant_id") REFERENCES "public"."services"("id","restaurant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_rooms" ADD CONSTRAINT "service_rooms_room_id_restaurant_id_rooms_id_restaurant_id_fk" FOREIGN KEY ("room_id","restaurant_id") REFERENCES "public"."rooms"("id","restaurant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_blocks" ADD CONSTRAINT "table_blocks_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_blocks" ADD CONSTRAINT "table_blocks_table_id_restaurant_id_tables_id_restaurant_id_fk" FOREIGN KEY ("table_id","restaurant_id") REFERENCES "public"."tables"("id","restaurant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_blocks" ADD CONSTRAINT "table_blocks_room_id_restaurant_id_rooms_id_restaurant_id_fk" FOREIGN KEY ("room_id","restaurant_id") REFERENCES "public"."rooms"("id","restaurant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "memberships_restaurant_id_index" ON "memberships" USING btree ("restaurant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_idx" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "tables_room_id_index" ON "tables" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "table_adjacencies_restaurant_id_index" ON "table_adjacencies" USING btree ("restaurant_id");--> statement-breakpoint
CREATE INDEX "table_combination_members_table_id_index" ON "table_combination_members" USING btree ("table_id");--> statement-breakpoint
CREATE INDEX "calendar_exceptions_restaurant_id_date_from_date_to_index" ON "calendar_exceptions" USING btree ("restaurant_id","date_from","date_to");--> statement-breakpoint
CREATE INDEX "duration_rules_restaurant_id_index" ON "duration_rules" USING btree ("restaurant_id");--> statement-breakpoint
CREATE INDEX "table_blocks_restaurant_id_starts_at_index" ON "table_blocks" USING btree ("restaurant_id","starts_at");--> statement-breakpoint
CREATE INDEX "audit_log_restaurant_id_created_at_index" ON "audit_log" USING btree ("restaurant_id","created_at");