-- Deal (agreement) numbers start at 2653 instead of 1001. Deals already numbered keep their number
-- (it may already be on a sent or signed agreement); the next new deal gets 2653. GREATEST keeps the
-- sequence from ever moving backwards, so this is safe on any database, fresh or not.
SELECT setval('sales.deal_number_seq', GREATEST(
    2652,
    (SELECT COALESCE(MAX(number), 0) FROM sales.deals),
    (SELECT last_value FROM sales.deal_number_seq)
), true);
