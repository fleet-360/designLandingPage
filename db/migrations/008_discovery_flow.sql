-- Spec requests:
-- * a price before discount, struck through next to the price on the client's page and in the invite
--   email. NULL = not shown.
-- * the client picks the meeting time first and pays last. The picked time is held for the client
--   (booking_status 'held') until held_until; the calendar invite goes out once the payment is confirmed.
-- * the responsible salesperson and team lead, shown in the booking confirmation:
--   { "sales": { "name", "phone" }, "lead": { "name", "phone" } }
ALTER TABLE sales.discovery ADD COLUMN IF NOT EXISTS list_price numeric(12,2) CHECK (list_price IS NULL OR list_price > 0);
ALTER TABLE sales.discovery ADD COLUMN IF NOT EXISTS held_until timestamptz;
ALTER TABLE sales.discovery ADD COLUMN IF NOT EXISTS contacts jsonb;

-- The company phone moved to 053-946-2842. Saved settings override the defaults in api/_lib/sales.js,
-- so replace the old number where it was saved.
UPDATE sales.settings
   SET value = regexp_replace(value::text, '(\+972[- ]?|0)52[- ]?624[- ]?7267', '053-9462842', 'g')::jsonb, updated_at = now()
 WHERE value::text ~ '52[- ]?624[- ]?7267';
