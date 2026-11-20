-- Sales: spec requests (paid planning sprint + meeting), deals (work order, agreement, card), the
-- email outbox Toro sends from, and settings. Grow and Caspit remain the record for money.

CREATE SCHEMA IF NOT EXISTS sales;

CREATE TABLE sales.settings (
    key         text        PRIMARY KEY,
    value       jsonb       NOT NULL,
    updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Spec request: the client sees the planning sprint, pays, and books the kick-off meeting.
CREATE TABLE sales.discovery (
    id                 uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    token              text          NOT NULL UNIQUE,
    created_at         timestamptz   NOT NULL DEFAULT now(),
    created_by         text          NOT NULL,
    client_name        text          NOT NULL,
    company_name       text,
    email              text,
    phone              text,
    tax_id             text,
    price              numeric(12,2) NOT NULL CHECK (price > 0),
    vat_rate           numeric(5,2)  NOT NULL,
    note               text,
    meeting_minutes    integer       NOT NULL DEFAULT 60,
    status             text          NOT NULL DEFAULT 'sent',   -- sent | viewed | paid | booked | canceled
    viewed_at          timestamptz,
    paid_at            timestamptz,
    paid_via           text,                                     -- grow | manual
    payment_ref        text,
    booking_status     text,                                     -- pending | confirmed | invited | failed
    meeting_start      timestamptz,
    meeting_end        timestamptz,
    attendees          jsonb         NOT NULL DEFAULT '[]',
    calendar_event_id  text,
    meet_url           text,
    booking_error      text,
    booked_at          timestamptz,
    canceled_at        timestamptz,
    updated_at         timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX discovery_created_idx ON sales.discovery (created_at DESC);
CREATE UNIQUE INDEX discovery_meeting_slot_idx ON sales.discovery (meeting_start)
    WHERE meeting_start IS NOT NULL AND canceled_at IS NULL;

CREATE SEQUENCE sales.deal_number_seq START 1001;

-- Deal: data = what sales entered, client = what the client may correct (name, tax id, signer...).
-- snapshot = everything the client approved and signed (order, schedule, agreement text), frozen
-- with its hash; later template changes never reach a deal already sent.
CREATE TABLE sales.deals (
    id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    token               text        NOT NULL UNIQUE,
    number              integer     NOT NULL UNIQUE DEFAULT nextval('sales.deal_number_seq'),
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          text        NOT NULL,
    data                jsonb       NOT NULL,
    client              jsonb       NOT NULL,
    order_status        text        NOT NULL DEFAULT 'sent',        -- sent | viewed | approved
    agreement_status    text        NOT NULL DEFAULT 'pending',     -- pending | signed
    deposit_status      text        NOT NULL DEFAULT 'pending',     -- pending | paid
    card_status         text        NOT NULL DEFAULT 'not_required',-- not_required | pending | set | failed
    project_status      text        NOT NULL DEFAULT 'not_started', -- not_started | started | delivered
    project_started_on  date,
    viewed_at           timestamptz,
    approved_at         timestamptz,
    approval            jsonb,
    signed_at           timestamptz,
    signature           jsonb,
    snapshot            jsonb,
    snapshot_hash       text,
    signed_pdf_file_id  uuid,
    subscription_id     uuid,
    canceled_at         timestamptz,
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX deals_created_idx ON sales.deals (created_at DESC);

CREATE TABLE sales.events (
    id         bigserial   PRIMARY KEY,
    at         timestamptz NOT NULL DEFAULT now(),
    entity     text        NOT NULL,   -- discovery | deal | subscription
    entity_id  uuid        NOT NULL,
    type       text        NOT NULL,
    detail     jsonb
);

CREATE INDEX events_entity_idx ON sales.events (entity, entity_id, at);

-- Email Toro sends for us (cars-server proAlgoSales /mail reads it back by id, once).
CREATE TABLE sales.outbox (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at   timestamptz NOT NULL DEFAULT now(),
    entity       text,
    entity_id    uuid,
    kind         text        NOT NULL,
    to_list      text[]      NOT NULL,
    cc_list      text[]      NOT NULL DEFAULT '{}',
    reply_to     text,
    subject      text        NOT NULL,
    html         text        NOT NULL,
    attachments  jsonb       NOT NULL DEFAULT '[]',   -- [{ filename, file_id }] (sign.files)
    status       text        NOT NULL DEFAULT 'queued', -- queued | fetched | sent | failed
    fetched_at   timestamptz,
    sent_at      timestamptz,
    error        text
);

CREATE INDEX outbox_entity_idx ON sales.outbox (entity, entity_id);
