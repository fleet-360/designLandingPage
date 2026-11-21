-- The billing day follows the first charge date, which can be the 29th-31st. In shorter months the
-- charge falls on the month's last day (addMonths in api/_lib/sales-calc.js).
ALTER TABLE billing.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_day_of_month_check;
ALTER TABLE billing.subscriptions ADD CONSTRAINT subscriptions_day_of_month_check CHECK (day_of_month BETWEEN 1 AND 31);
