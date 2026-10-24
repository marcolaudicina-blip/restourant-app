ALTER TABLE "booking_policies" ADD COLUMN "email_staff_bookings" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "booking_policies" ADD COLUMN "send_reminders" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "reminder_sent_at" timestamp with time zone;