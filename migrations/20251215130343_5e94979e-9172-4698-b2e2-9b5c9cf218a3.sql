-- ============================================
-- Automatic Actual Due Date Calculation
-- ============================================

-- 1. Add new columns to invoice table
ALTER TABLE public.invoice ADD COLUMN IF NOT EXISTS payment_trigger_event text;
ALTER TABLE public.invoice ADD COLUMN IF NOT EXISTS payment_offset_days integer;
ALTER TABLE public.invoice ADD COLUMN IF NOT EXISTS actual_due_date_is_fallback boolean DEFAULT false;

-- 2. Add new columns to bl_order table for downpayment due date tracking
ALTER TABLE public.bl_order ADD COLUMN IF NOT EXISTS downpayment_payment_trigger text;
ALTER TABLE public.bl_order ADD COLUMN IF NOT EXISTS downpayment_original_due_date date;
ALTER TABLE public.bl_order ADD COLUMN IF NOT EXISTS downpayment_actual_due_date date;
ALTER TABLE public.bl_order ADD COLUMN IF NOT EXISTS downpayment_actual_due_date_is_fallback boolean DEFAULT false;

-- 3. Create function to resolve trigger date for invoices (BL level)
CREATE OR REPLACE FUNCTION public.resolve_invoice_trigger_date(
  p_invoice_id bigint
) RETURNS date
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trigger_event text;
  v_bl_order_name text;
  v_order_id text;
  v_trigger_date date;
  v_bl_order_id bigint;
BEGIN
  -- Get invoice details
  SELECT 
    LOWER(TRIM(COALESCE(payment_trigger_event, ''))),
    bl_order_name,
    order_id
  INTO v_trigger_event, v_bl_order_name, v_order_id
  FROM invoice
  WHERE id = p_invoice_id;

  IF v_trigger_event IS NULL OR v_trigger_event = '' THEN
    RETURN NULL;
  END IF;

  -- Get bl_order_id from bl_order_name
  SELECT id INTO v_bl_order_id
  FROM bl_order
  WHERE bl_order_name = v_bl_order_name
  LIMIT 1;

  -- Map trigger event to date source
  CASE v_trigger_event
    WHEN 'ata' THEN
      SELECT ata INTO v_trigger_date FROM bl_order WHERE id = v_bl_order_id;
    WHEN 'bl confirmed' THEN
      SELECT bl_confirmed_date INTO v_trigger_date FROM bl_order WHERE id = v_bl_order_id;
    WHEN 'bl issued' THEN
      SELECT bl_issue_date INTO v_trigger_date FROM bl_extraction WHERE bl_order_id = v_bl_order_id LIMIT 1;
    WHEN 'bl released' THEN
      SELECT bl_release_date INTO v_trigger_date FROM bl_order WHERE id = v_bl_order_id;
    WHEN 'booking' THEN
      SELECT booking_date INTO v_trigger_date FROM bl_order WHERE id = v_bl_order_id;
    WHEN 'customs clearance' THEN
      SELECT customs_clearance INTO v_trigger_date FROM bl_order WHERE id = v_bl_order_id;
    WHEN 'dp' THEN
      SELECT documents_sent_date INTO v_trigger_date FROM bl_order WHERE id = v_bl_order_id;
    WHEN 'eta' THEN
      SELECT eta INTO v_trigger_date FROM bl_order WHERE id = v_bl_order_id;
    WHEN 'etd' THEN
      SELECT etd INTO v_trigger_date FROM bl_order WHERE id = v_bl_order_id;
    WHEN 'inspection' THEN
      SELECT ata INTO v_trigger_date FROM bl_order WHERE id = v_bl_order_id;
    WHEN 'invoice' THEN
      SELECT issue_date INTO v_trigger_date FROM invoice WHERE id = p_invoice_id;
    WHEN 'loading' THEN
      SELECT loading_date INTO v_trigger_date FROM bl_extraction WHERE bl_order_id = v_bl_order_id LIMIT 1;
    WHEN 'order signed date' THEN
      SELECT completed_at::date INTO v_trigger_date 
      FROM document_signatures 
      WHERE reference_id = v_order_id 
        AND status = 'completed'
      ORDER BY completed_at DESC
      LIMIT 1;
    ELSE
      -- Unknown trigger event or "other - custom"
      RETURN NULL;
  END CASE;

  RETURN v_trigger_date;
END;
$$;

-- 4. Create function to compute actual due date for invoice
CREATE OR REPLACE FUNCTION public.compute_invoice_actual_due_date(
  p_invoice_id bigint
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trigger_date date;
  v_offset_days integer;
  v_original_due_date date;
  v_actual_due_date date;
  v_is_fallback boolean := false;
BEGIN
  -- Get invoice details
  SELECT 
    COALESCE(payment_offset_days, 0),
    original_due_date
  INTO v_offset_days, v_original_due_date
  FROM invoice
  WHERE id = p_invoice_id;

  -- Resolve trigger date
  v_trigger_date := resolve_invoice_trigger_date(p_invoice_id);

  -- Calculate actual due date
  IF v_trigger_date IS NOT NULL THEN
    v_actual_due_date := v_trigger_date + v_offset_days;
    v_is_fallback := false;
  ELSE
    v_actual_due_date := v_original_due_date;
    v_is_fallback := true;
  END IF;

  -- Update invoice
  UPDATE invoice
  SET 
    actual_due_date = v_actual_due_date,
    actual_due_date_is_fallback = v_is_fallback
  WHERE id = p_invoice_id;
END;
$$;

-- 5. Create function to resolve trigger date for downpayment (Order level via BL)
CREATE OR REPLACE FUNCTION public.resolve_downpayment_trigger_date(
  p_bl_order_id bigint
) RETURNS date
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trigger text;
  v_order_id text;
  v_trigger_date date;
BEGIN
  -- Get bl_order details
  SELECT 
    LOWER(TRIM(COALESCE(downpayment_payment_trigger, ''))),
    order_id
  INTO v_trigger, v_order_id
  FROM bl_order
  WHERE id = p_bl_order_id;

  IF v_trigger IS NULL OR v_trigger = '' THEN
    RETURN NULL;
  END IF;

  -- Map trigger to date source
  CASE v_trigger
    WHEN 'against loading', 'loading' THEN
      SELECT loading_date INTO v_trigger_date FROM bl_extraction WHERE bl_order_id = p_bl_order_id LIMIT 1;
    WHEN 'against release bl', 'bl released' THEN
      SELECT bl_release_date INTO v_trigger_date FROM bl_order WHERE id = p_bl_order_id;
    WHEN 'booking' THEN
      SELECT booking_date INTO v_trigger_date FROM bl_order WHERE id = p_bl_order_id;
    WHEN 'invoice' THEN
      SELECT issue_date INTO v_trigger_date 
      FROM invoice 
      WHERE order_id = v_order_id 
        AND LOWER(invoice_type) = 'downpayment'
      ORDER BY issue_date DESC
      LIMIT 1;
    WHEN 'order signed date' THEN
      SELECT completed_at::date INTO v_trigger_date 
      FROM document_signatures 
      WHERE reference_id = v_order_id 
        AND status = 'completed'
      ORDER BY completed_at DESC
      LIMIT 1;
    ELSE
      RETURN NULL;
  END CASE;

  RETURN v_trigger_date;
END;
$$;

-- 6. Create function to compute actual due date for downpayment
CREATE OR REPLACE FUNCTION public.compute_downpayment_actual_due_date(
  p_bl_order_id bigint
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trigger_date date;
  v_original_due_date date;
  v_actual_due_date date;
  v_is_fallback boolean := false;
BEGIN
  -- Get downpayment details
  SELECT downpayment_original_due_date
  INTO v_original_due_date
  FROM bl_order
  WHERE id = p_bl_order_id;

  -- Resolve trigger date
  v_trigger_date := resolve_downpayment_trigger_date(p_bl_order_id);

  -- Calculate actual due date (no offset for downpayments)
  IF v_trigger_date IS NOT NULL THEN
    v_actual_due_date := v_trigger_date;
    v_is_fallback := false;
  ELSE
    v_actual_due_date := v_original_due_date;
    v_is_fallback := true;
  END IF;

  -- Update bl_order
  UPDATE bl_order
  SET 
    downpayment_actual_due_date = v_actual_due_date,
    downpayment_actual_due_date_is_fallback = v_is_fallback
  WHERE id = p_bl_order_id;
END;
$$;

-- 7. Create trigger function for invoice updates
CREATE OR REPLACE FUNCTION public.trigger_compute_invoice_actual_due_date()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Recompute actual due date when relevant fields change
  IF TG_OP = 'INSERT' OR 
     OLD.payment_trigger_event IS DISTINCT FROM NEW.payment_trigger_event OR
     OLD.payment_offset_days IS DISTINCT FROM NEW.payment_offset_days OR
     OLD.original_due_date IS DISTINCT FROM NEW.original_due_date OR
     OLD.issue_date IS DISTINCT FROM NEW.issue_date THEN
    PERFORM compute_invoice_actual_due_date(NEW.id);
  END IF;
  
  RETURN NEW;
END;
$$;

-- 8. Create trigger on invoice table
DROP TRIGGER IF EXISTS trg_compute_invoice_actual_due_date ON invoice;
CREATE TRIGGER trg_compute_invoice_actual_due_date
  AFTER INSERT OR UPDATE ON invoice
  FOR EACH ROW
  EXECUTE FUNCTION trigger_compute_invoice_actual_due_date();

-- 9. Create trigger function for bl_order updates (for downpayment)
CREATE OR REPLACE FUNCTION public.trigger_compute_downpayment_due_date()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Recompute actual due date when relevant fields change
  IF TG_OP = 'INSERT' OR 
     OLD.downpayment_payment_trigger IS DISTINCT FROM NEW.downpayment_payment_trigger OR
     OLD.downpayment_original_due_date IS DISTINCT FROM NEW.downpayment_original_due_date OR
     OLD.bl_release_date IS DISTINCT FROM NEW.bl_release_date OR
     OLD.booking_date IS DISTINCT FROM NEW.booking_date THEN
    PERFORM compute_downpayment_actual_due_date(NEW.id);
  END IF;
  
  RETURN NEW;
END;
$$;

-- 10. Create trigger on bl_order table
DROP TRIGGER IF EXISTS trg_compute_downpayment_due_date ON bl_order;
CREATE TRIGGER trg_compute_downpayment_due_date
  AFTER INSERT OR UPDATE ON bl_order
  FOR EACH ROW
  EXECUTE FUNCTION trigger_compute_downpayment_due_date();

-- 11. Create trigger function for bl_order date changes affecting invoices
CREATE OR REPLACE FUNCTION public.trigger_recompute_invoice_due_dates_on_bl_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- When bl_order dates change, recompute all linked invoices
  IF OLD.eta IS DISTINCT FROM NEW.eta OR
     OLD.etd IS DISTINCT FROM NEW.etd OR
     OLD.ata IS DISTINCT FROM NEW.ata OR
     OLD.booking_date IS DISTINCT FROM NEW.booking_date OR
     OLD.bl_confirmed_date IS DISTINCT FROM NEW.bl_confirmed_date OR
     OLD.customs_clearance IS DISTINCT FROM NEW.customs_clearance OR
     OLD.documents_sent_date IS DISTINCT FROM NEW.documents_sent_date OR
     OLD.bl_release_date IS DISTINCT FROM NEW.bl_release_date THEN
    
    -- Recompute all invoices linked to this BL
    PERFORM compute_invoice_actual_due_date(id)
    FROM invoice
    WHERE bl_order_name = NEW.bl_order_name;
  END IF;
  
  RETURN NEW;
END;
$$;

-- 12. Create trigger on bl_order for invoice recomputation
DROP TRIGGER IF EXISTS trg_recompute_invoice_due_dates_on_bl_change ON bl_order;
CREATE TRIGGER trg_recompute_invoice_due_dates_on_bl_change
  AFTER UPDATE ON bl_order
  FOR EACH ROW
  EXECUTE FUNCTION trigger_recompute_invoice_due_dates_on_bl_change();

-- 13. Create trigger function for bl_extraction date changes
CREATE OR REPLACE FUNCTION public.trigger_recompute_due_dates_on_extraction_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bl_order_name text;
BEGIN
  -- Get bl_order_name for this extraction
  SELECT bl_order_name INTO v_bl_order_name
  FROM bl_order
  WHERE id = COALESCE(NEW.bl_order_id, OLD.bl_order_id);

  -- When extraction dates change, recompute invoices and downpayments
  IF OLD.loading_date IS DISTINCT FROM NEW.loading_date OR
     OLD.bl_issue_date IS DISTINCT FROM NEW.bl_issue_date THEN
    
    -- Recompute invoices
    IF v_bl_order_name IS NOT NULL THEN
      PERFORM compute_invoice_actual_due_date(id)
      FROM invoice
      WHERE bl_order_name = v_bl_order_name;
    END IF;
    
    -- Recompute downpayment
    IF NEW.bl_order_id IS NOT NULL THEN
      PERFORM compute_downpayment_actual_due_date(NEW.bl_order_id);
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- 14. Create trigger on bl_extraction
DROP TRIGGER IF EXISTS trg_recompute_due_dates_on_extraction_change ON bl_extraction;
CREATE TRIGGER trg_recompute_due_dates_on_extraction_change
  AFTER UPDATE ON bl_extraction
  FOR EACH ROW
  EXECUTE FUNCTION trigger_recompute_due_dates_on_extraction_change();

-- 15. Create trigger function for document_signatures changes
CREATE OR REPLACE FUNCTION public.trigger_recompute_due_dates_on_signature_complete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- When signature is completed, recompute affected invoices/downpayments
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM NEW.status OR OLD.completed_at IS DISTINCT FROM NEW.completed_at) THEN
    -- Recompute invoices for this order
    PERFORM compute_invoice_actual_due_date(id)
    FROM invoice
    WHERE order_id = NEW.reference_id;
    
    -- Recompute downpayments for BLs in this order
    PERFORM compute_downpayment_actual_due_date(id)
    FROM bl_order
    WHERE order_id = NEW.reference_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- 16. Create trigger on document_signatures
DROP TRIGGER IF EXISTS trg_recompute_due_dates_on_signature_complete ON document_signatures;
CREATE TRIGGER trg_recompute_due_dates_on_signature_complete
  AFTER UPDATE ON document_signatures
  FOR EACH ROW
  EXECUTE FUNCTION trigger_recompute_due_dates_on_signature_complete();