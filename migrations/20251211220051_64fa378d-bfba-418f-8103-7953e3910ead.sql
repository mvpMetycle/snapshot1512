-- Backfill inventory_match with existing order data (only for valid tickets)
INSERT INTO inventory_match (buy_ticket_id, sell_ticket_id, order_id, allocated_quantity_mt, match_date)
SELECT 
  CAST(o.buyer AS bigint) as buy_ticket_id,
  CAST(o.seller AS bigint) as sell_ticket_id,
  o.id as order_id,
  o.allocated_quantity_mt,
  COALESCE(o.created_at, NOW()) as match_date
FROM "order" o
INNER JOIN ticket bt ON CAST(o.buyer AS bigint) = bt.id
INNER JOIN ticket st ON CAST(o.seller AS bigint) = st.id
WHERE 
  o.buyer IS NOT NULL 
  AND o.seller IS NOT NULL 
  AND o.deleted_at IS NULL;