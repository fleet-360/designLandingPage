-- The signed PDF made at signing time (api/_lib/sign-pdf.js), kept in sign.files as the record.
ALTER TABLE sign.submissions
    ADD COLUMN pdf_file_id  uuid,
    ADD COLUMN pdf_sha256   text,
    ADD COLUMN pdf_version  integer;
