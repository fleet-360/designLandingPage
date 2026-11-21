-- Spec request: the key lines at the top of the client's page, written with Claude from what sales typed about
-- the client's problem, then edited by sales (api/_lib/ai-pitch.js).
--   { "problem": "what sales typed (internal)", "headline": "...", "lines": ["...", "..."] }
-- NULL: the page shows its standard opening.
ALTER TABLE sales.discovery ADD COLUMN IF NOT EXISTS pitch jsonb;
