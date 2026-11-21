-- Spec requests and deals that were closed outside the client's link, entered by sales.
--
-- Spec request: sales chooses what the client's page offers (both by default).
--   show_booking false: sales types the meeting time (booking_status 'manual'); no calendar invite is sent.
--   show_payment false: sales types how the client paid or will pay (payment_method, payment_note); it is
--                       marked paid (paid_via 'manual') when sales says it was paid. Both stay editable.
ALTER TABLE sales.discovery ADD COLUMN IF NOT EXISTS show_booking boolean NOT NULL DEFAULT true;
ALTER TABLE sales.discovery ADD COLUMN IF NOT EXISTS show_payment boolean NOT NULL DEFAULT true;
ALTER TABLE sales.discovery ADD COLUMN IF NOT EXISTS payment_method text;   -- transfer | bit | card | check | cash | other
ALTER TABLE sales.discovery ADD COLUMN IF NOT EXISTS payment_note text;

-- A meeting sales typed in still keeps its time from clients booking online, but two typed-in meetings may
-- start together (another team lead); only the times booked here are unique.
DROP INDEX IF EXISTS sales.discovery_meeting_slot_idx;
CREATE UNIQUE INDEX discovery_meeting_slot_idx ON sales.discovery (meeting_start)
    WHERE meeting_start IS NOT NULL AND canceled_at IS NULL AND booking_status IS DISTINCT FROM 'manual';

-- Deal: sign_mode 'manual' = the client signed outside the link (on paper, or another tool). Sales uploads the
-- signed contract (signed_pdf_file_id, a PDF or an image) and the deal is approved and signed as of that date,
-- without the agreement screen. payment_note: how the client pays or paid (internal), editable at any time.
ALTER TABLE sales.deals ADD COLUMN IF NOT EXISTS sign_mode text NOT NULL DEFAULT 'link';   -- link | manual
ALTER TABLE sales.deals ADD COLUMN IF NOT EXISTS payment_note text;
