-- Payment links (/pay-link) and the payments Toro reports for them.
-- Grow is the source of truth for money; these tables are the dashboard's record.

CREATE SCHEMA IF NOT EXISTS pay;

CREATE TABLE pay.links (
    id               uuid PRIMARY KEY,
    created_at       timestamptz   NOT NULL DEFAULT now(),
    created_by       text          NOT NULL,
    amount           numeric(12,2) NOT NULL CHECK (amount > 0),
    amount_locked    boolean       NOT NULL DEFAULT true,
    max_payments     integer       NOT NULL DEFAULT 1 CHECK (max_payments BETWEEN 1 AND 12),
    description      text          NOT NULL,
    customer_name    text,
    customer_phone   text,
    customer_email   text,
    customer_tax_id  text,
    lang             text          NOT NULL DEFAULT 'he' CHECK (lang IN ('he', 'en')),
    expires_at       timestamptz,
    url              text          NOT NULL
);

CREATE INDEX links_created_at_idx ON pay.links (created_at DESC);

-- One row per Grow transaction. link_id is null for payments made through links created
-- before links were stored; it has no foreign key so a payment is never rejected over it.
CREATE TABLE pay.payments (
    id               bigserial     PRIMARY KEY,
    transaction_id   text          NOT NULL UNIQUE,
    link_id          uuid,
    received_at      timestamptz   NOT NULL DEFAULT now(),
    payment_date     text,
    sum              numeric(12,2) NOT NULL,
    payments_num     integer,
    description      text,
    payer_name       text,
    payer_phone      text,
    payer_email      text,
    asmachta         text,
    card_suffix      text,
    process_id       text,
    invoice_number   text
);

CREATE INDEX payments_link_id_idx ON pay.payments (link_id);
CREATE INDEX payments_received_at_idx ON pay.payments (received_at DESC);

-- Failed /pay-link sign-ins, for throttling.
CREATE TABLE pay.login_failures (
    ip   text        NOT NULL,
    at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX login_failures_ip_at_idx ON pay.login_failures (ip, at);
