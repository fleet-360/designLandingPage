-- Contracts (/contracts, formerly SignEase on Base44): forms, signed submissions, their files,
-- and an append-only audit log. Column names follow the Base44 entities the app was written for.

CREATE SCHEMA IF NOT EXISTS sign;

CREATE TABLE sign.forms (
    id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    title             text        NOT NULL,
    blocks            jsonb       NOT NULL DEFAULT '[]',
    is_published      boolean     NOT NULL DEFAULT false,
    published_date    timestamptz,
    submission_count  integer     NOT NULL DEFAULT 0,
    created_by        text,
    created_date      timestamptz NOT NULL DEFAULT now(),
    updated_date      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX forms_created_date_idx ON sign.forms (created_date DESC);

-- Files: images placed in forms (public) and signature images (private, admin only).
CREATE TABLE sign.files (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    created_date  timestamptz NOT NULL DEFAULT now(),
    is_public     boolean     NOT NULL,
    name          text,
    content_type  text        NOT NULL,
    size          integer     NOT NULL,
    data          bytea       NOT NULL
);

-- One row per signature. form_snapshot is the form exactly as the signer saw it.
-- signatures maps each signature block id to a sign.files id.
CREATE TABLE sign.submissions (
    id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    form_id           uuid        NOT NULL,
    form_title        text,
    form_snapshot     jsonb       NOT NULL,
    field_values      jsonb       NOT NULL DEFAULT '{}',
    signatures        jsonb       NOT NULL DEFAULT '{}',
    status            text        NOT NULL DEFAULT 'signed',
    signer_name       text,
    signer_id_number  text,
    signer_email      text,
    signer_ip         text,
    signer_user_agent text,
    signed_at         timestamptz NOT NULL,
    document_hash     text        NOT NULL,
    guid              uuid        NOT NULL UNIQUE,
    consent_text      text,
    consent_at        timestamptz,
    notified_at       timestamptz,
    created_date      timestamptz NOT NULL DEFAULT now(),
    updated_date      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX submissions_form_idx ON sign.submissions (form_id, created_date DESC);

-- Legal audit trail: written once per signature, never changed or removed, even when the
-- submission itself is deleted.
CREATE TABLE sign.audit_log (
    id                bigserial   PRIMARY KEY,
    created_date      timestamptz NOT NULL DEFAULT now(),
    event_type        text        NOT NULL DEFAULT 'signed',
    submission_id     uuid        NOT NULL,
    form_id           uuid        NOT NULL,
    signer_name       text,
    signer_email      text,
    signer_ip         text,
    signer_user_agent text,
    signed_at_utc     timestamptz NOT NULL,
    guid              uuid        NOT NULL,
    document_hash     text        NOT NULL,
    consent_text      text
);

CREATE FUNCTION sign.audit_log_is_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'sign.audit_log is append-only';
END $$;

CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON sign.audit_log
    FOR EACH ROW EXECUTE FUNCTION sign.audit_log_is_append_only();
