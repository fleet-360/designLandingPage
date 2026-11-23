-- גבייה (collections): customers, their payment schedules, check pickups and a change log.
-- Fed by hand, by signed deals (api/_lib/collections.js syncSignedDeal) and by Kaspit's open
-- documents (api/_lib/collections-kaspit.js, every two hours). Every amount is stored as entered;
-- vat_included says whether it already includes VAT (the screens always show it with VAT).
CREATE SCHEMA IF NOT EXISTS collections;

CREATE TABLE collections.customers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  tax_id          text,                                -- ח.פ / ע.מ, 9 digits: how deals and Kaspit find the customer
  contact_person  text NOT NULL DEFAULT '',
  phone           text NOT NULL DEFAULT '',
  email           text NOT NULL DEFAULT '',
  internal_owner  text NOT NULL DEFAULT '',
  project_stages  text NOT NULL DEFAULT '',
  notes           text NOT NULL DEFAULT '',
  source          text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'deal', 'kaspit', 'import')),
  legacy_id       text UNIQUE,                         -- the record id in the previous (Base44) system
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX customers_tax_id ON collections.customers (tax_id) WHERE tax_id IS NOT NULL;

CREATE TABLE collections.payments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id      uuid NOT NULL REFERENCES collections.customers (id) ON DELETE CASCADE,
  description      text NOT NULL DEFAULT '',
  milestone        text NOT NULL DEFAULT '',
  amount           numeric(14, 2) NOT NULL CHECK (amount >= 0),
  vat_included     boolean NOT NULL DEFAULT true,
  due_date         date,
  method           text NOT NULL DEFAULT 'transfer' CHECK (method IN ('check', 'transfer', 'cash', 'credit', 'other')),
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'blocked', 'cancelled')),
  doc_type         text NOT NULL DEFAULT '',
  doc_number       text,                               -- the invoice number: one payment per document, see the index
  doc_date         date,
  receipt_number   text NOT NULL DEFAULT '',
  receipt_date     date,
  billing_name     text NOT NULL DEFAULT '',
  check_number     text NOT NULL DEFAULT '',
  collection_date  date,                               -- checks: when the courier picks them up
  check_received   boolean NOT NULL DEFAULT false,
  paid_date        date,
  needs_review     boolean NOT NULL DEFAULT false,
  notes            text NOT NULL DEFAULT '',
  source           text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'deal', 'kaspit', 'import')),
  deal_id          uuid,                               -- from a signed deal: sales.deals.id and the schedule row (1 = deposit)
  deal_row         integer,
  kaspit_document_id text UNIQUE,                      -- Kaspit's DocumentId once the payment is tied to a Kaspit document
  kaspit_open      boolean,                            -- open (unpaid) in Kaspit at the last sync
  kaspit_synced_at timestamptz,
  legacy_id        text UNIQUE,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payments_customer ON collections.payments (customer_id);
-- One payment per document number, whoever entered it (by hand, from a deal or from Kaspit)
CREATE UNIQUE INDEX payments_doc_number ON collections.payments (doc_number) WHERE doc_number IS NOT NULL AND doc_number <> '';
-- One payment per row of a signed deal's schedule, however many times the sync runs
CREATE UNIQUE INDEX payments_deal_row ON collections.payments (deal_id, deal_row) WHERE deal_id IS NOT NULL;

CREATE TABLE collections.check_pickups (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id      uuid NOT NULL REFERENCES collections.customers (id) ON DELETE CASCADE,
  customer_name    text NOT NULL DEFAULT '',
  collection_date  date NOT NULL,
  status           text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'collected', 'cancelled')),
  check_count      integer NOT NULL DEFAULT 0,
  total_amount     numeric(14, 2) NOT NULL DEFAULT 0,  -- with VAT
  contact_person   text NOT NULL DEFAULT '',
  address          text NOT NULL DEFAULT '',
  notes            text NOT NULL DEFAULT '',
  manual           boolean NOT NULL DEFAULT false,     -- edited by hand: the automatic sync leaves it alone
  legacy_id        text UNIQUE,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX check_pickups_customer ON collections.check_pickups (customer_id);

-- What changed, by whom, with the state before (snapshot) so it can be restored
CREATE TABLE collections.activity (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action         text NOT NULL CHECK (action IN ('create', 'update', 'delete', 'restore')),
  entity         text NOT NULL CHECK (entity IN ('customer', 'payment', 'collection')),
  record_id      text NOT NULL DEFAULT '',
  title          text NOT NULL DEFAULT '',
  customer_name  text NOT NULL DEFAULT '',
  user_name      text NOT NULL DEFAULT '',
  details        text NOT NULL DEFAULT '',
  snapshot       jsonb,
  restorable     boolean NOT NULL DEFAULT true,
  legacy_id      text UNIQUE,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX activity_created ON collections.activity (created_at DESC);

-- Each Kaspit sync: when, what triggered it, what it found
CREATE TABLE collections.sync_runs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source       text NOT NULL DEFAULT 'kaspit',
  trigger      text NOT NULL,                          -- schedule | manual
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz,
  ok           boolean,
  stats        jsonb,
  error        text
);
CREATE INDEX sync_runs_started ON collections.sync_runs (started_at DESC);
