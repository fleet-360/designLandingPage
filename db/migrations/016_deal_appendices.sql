-- Appendices (נספחים) to a signed agreement: issued by sales, signed by the client through the deal's link.
-- The deal's own snapshot, signed PDF and hash never change; each appendix keeps its own.
-- content: { title, body, vatRate, payments: [{ date, amount, method, vat, total }], totals } (api/_lib/deal.js cleanAppendix)
-- The payments are informational: they are not added to the standing order nor to collections.
CREATE TABLE sales.deal_appendices (
    id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    deal_id             uuid        NOT NULL REFERENCES sales.deals(id),
    n                   integer     NOT NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          text        NOT NULL,
    content             jsonb       NOT NULL,
    signed_at           timestamptz,
    signature           jsonb,
    snapshot            jsonb,
    snapshot_hash       text,
    signed_pdf_file_id  uuid,
    canceled_at         timestamptz,
    UNIQUE (deal_id, n)
);
