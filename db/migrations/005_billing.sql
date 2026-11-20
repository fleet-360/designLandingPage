-- Standing orders on saved card tokens, and their monthly charges. The site decides what is due;
-- Toro charges the token in Grow, issues the Caspit invoice and emails it (cars-server proAlgoSales).

CREATE SCHEMA IF NOT EXISTS billing;

-- schedule: [{ months: n | null, amount: before VAT }] counted from the first charge; a null
-- months period runs until stopped.
CREATE TABLE billing.subscriptions (
    id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at        timestamptz   NOT NULL DEFAULT now(),
    created_by        text,
    deal_id           uuid,
    card_link_token   text          NOT NULL UNIQUE,
    customer          jsonb         NOT NULL,   -- { name, company, taxId, email, phone, accountingEmail }
    description       text          NOT NULL,
    vat_rate          numeric(5,2)  NOT NULL,
    schedule          jsonb         NOT NULL,
    start_date        date,                     -- first charge; null until the project starts
    day_of_month      integer       NOT NULL DEFAULT 1 CHECK (day_of_month BETWEEN 1 AND 28),
    status            text          NOT NULL DEFAULT 'pending_card', -- pending_card | active | paused | canceled | ended
    card_token        text,
    card              jsonb,                    -- { suffix, brand, exp }
    card_set_at       timestamptz,
    next_charge_date  date,
    charges_done      integer       NOT NULL DEFAULT 0,
    failed_attempts   integer       NOT NULL DEFAULT 0,
    retry_on          date,
    paused_at         timestamptz,
    canceled_at       timestamptz,
    reminded_at       timestamptz,
    notes             text,
    updated_at        timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX subscriptions_next_idx ON billing.subscriptions (status, next_charge_date);

-- id doubles as Grow's transactionUniqueIdentifier: a request with an id already used is refused.
CREATE TABLE billing.charges (
    id                 bigserial     PRIMARY KEY,
    uid                uuid          NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    subscription_id    uuid          NOT NULL,
    charge_index       integer       NOT NULL,   -- 0 = first monthly charge
    due_date           date          NOT NULL,
    attempt            integer       NOT NULL DEFAULT 1,
    amount_before_vat  numeric(12,2) NOT NULL,
    amount             numeric(12,2) NOT NULL,
    status             text          NOT NULL DEFAULT 'processing', -- processing | paid | failed
    manual             boolean       NOT NULL DEFAULT false,
    created_at         timestamptz   NOT NULL DEFAULT now(),
    processed_at       timestamptz,
    transaction_id     text,
    asmachta           text,
    error              text,
    invoice_number     text,
    invoice_file_id    uuid,
    invoice_error      text
);

CREATE INDEX charges_subscription_idx ON billing.charges (subscription_id, created_at DESC);
-- one charge in flight per subscription
CREATE UNIQUE INDEX charges_one_processing_idx ON billing.charges (subscription_id) WHERE status = 'processing';
