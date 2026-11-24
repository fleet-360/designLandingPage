-- Kaspit's document type (TrxTypeId) of the document a payment is tied to: 1 tax invoice, 6 deal invoice,
-- 7 invoice-receipt, 2 receipt. Kaspit needs it to print the document (the invoice view in the collections screen).
ALTER TABLE collections.payments ADD COLUMN IF NOT EXISTS kaspit_trx_type smallint;
