-- Step 1: Drop the fixing_id foreign key and column from hedge_link
ALTER TABLE public.hedge_link
  DROP CONSTRAINT IF EXISTS hedge_link_fixing_id_fkey;

ALTER TABLE public.hedge_link
  DROP COLUMN IF EXISTS fixing_id;

-- Step 2: Add allocation_type column to hedge_link for tracking INITIAL_HEDGE, PRICE_FIX, ROLL
-- First create the enum type if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'hedge_link_allocation_type') THEN
        CREATE TYPE public.hedge_link_allocation_type AS ENUM ('INITIAL_HEDGE', 'PRICE_FIX', 'ROLL');
    END IF;
END$$;

-- Add the column
ALTER TABLE public.hedge_link
  ADD COLUMN IF NOT EXISTS allocation_type public.hedge_link_allocation_type;

-- Step 3: Drop the pricing_fixing table and its foreign key constraints
ALTER TABLE public.pricing_fixing
  DROP CONSTRAINT IF EXISTS pricing_fixing_bl_order_id_fkey;

ALTER TABLE public.pricing_fixing
  DROP CONSTRAINT IF EXISTS pricing_fixing_order_id_fkey;

ALTER TABLE public.pricing_fixing
  DROP CONSTRAINT IF EXISTS pricing_fixing_ticket_id_fkey;

DROP TABLE IF EXISTS public.pricing_fixing;