-- Create guest profiles for reservations made before profiles existed, matching by phone.
-- The normalization mirrors normalizePhone() in packages/shared/src/phone.ts.
CREATE TEMP TABLE reservation_phones AS
SELECT r.id AS reservation_id, r.restaurant_id, r.guest_name, r.guest_phone, r.guest_email, r.created_at,
       CASE WHEN p LIKE '+%' THEN p ELSE '+39' || p END AS phone_normalized
FROM reservations r
CROSS JOIN LATERAL (
  SELECT regexp_replace(regexp_replace(trim(r.guest_phone), '[\s().\-/]', '', 'g'), '^00', '+') AS p
) cleaned
WHERE r.guest_phone IS NOT NULL AND r.guest_id IS NULL AND p ~ '^\+?[0-9]+$';--> statement-breakpoint
DELETE FROM reservation_phones WHERE length(phone_normalized) - 1 NOT BETWEEN 8 AND 15;--> statement-breakpoint
INSERT INTO guests (restaurant_id, full_name, phone, phone_normalized, email)
SELECT DISTINCT ON (restaurant_id, phone_normalized)
       restaurant_id, guest_name, guest_phone, phone_normalized, guest_email
FROM reservation_phones
ORDER BY restaurant_id, phone_normalized, created_at DESC
ON CONFLICT (restaurant_id, phone_normalized) WHERE phone_normalized IS NOT NULL DO NOTHING;--> statement-breakpoint
UPDATE reservations r
SET guest_id = g.id
FROM reservation_phones rp
JOIN guests g ON g.restaurant_id = rp.restaurant_id AND g.phone_normalized = rp.phone_normalized
WHERE r.id = rp.reservation_id;--> statement-breakpoint
DROP TABLE reservation_phones;
