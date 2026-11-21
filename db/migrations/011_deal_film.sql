-- Deal: the demo film on the client's order page (api/_lib/demo-film.js). Kept apart from deal.data, so it
-- is never part of the approved order or the signed snapshot and can change at any time.
--   { "demoFileId": uuid (sign.files, the demo HTML gzipped), "demoName": "demo.html", "demoSize": bytes,
--     "logoFileId": uuid (sign.files, the client's logo), "script": { "scenes": [...] },
--     "scriptAt": iso, "published": bool }
-- NULL: no film; the page shows nothing in its place.
ALTER TABLE sales.deals ADD COLUMN IF NOT EXISTS film jsonb;
