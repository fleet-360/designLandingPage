-- Emails that Toro could not send are tried again by the daily cron (api/_routes/cron/daily.js)
ALTER TABLE sales.outbox ADD COLUMN IF NOT EXISTS retries int NOT NULL DEFAULT 0;
