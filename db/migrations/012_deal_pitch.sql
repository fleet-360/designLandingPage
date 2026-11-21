-- Deal: the key lines at the top of the client's order page and in the order email, written with Claude and
-- edited by sales, as for a spec request (010_discovery_pitch.sql). Kept apart from deal.data, so it is never
-- part of the approved order or the signed snapshot and can change at any time.
--   { "problem": "what sales typed (internal)", "headline": "...", "lines": ["...", "..."] }
-- NULL: the page shows its standard opening.
ALTER TABLE sales.deals ADD COLUMN IF NOT EXISTS pitch jsonb;
