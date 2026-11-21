-- The demo film of a deal not created yet: sales makes it in the new-deal form, together with everything
-- else, and creating the deal moves it to sales.deals.film (api/_routes/sales/deals.js). Same shape as
-- that column. A draft left behind (the form was closed) is deleted with its files after 14 days.
CREATE TABLE IF NOT EXISTS sales.film_drafts (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    film        jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_by  text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);
