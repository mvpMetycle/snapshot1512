-- Migration: Fix actual_due_date calculation to source trigger data from ticket table
-- Removes duplicated columns from invoice and rewrites SQL functions to traverse relationship chain

-- Step 1: Remove incorrectly duplicated columns from invoice table
-- (payment_trigger_event and payment_offset_days belong on ticket, not invoice)
ALTER TABLE public.invoice DROP COLUMN IF EXISTS payment_trigger_event;
ALTER TABLE public.invoice DROP COLUMN IF EXISTS payment_offset_days;

-- Step 2: Drop existing triggers that reference old functions
DROP TRIGGER IF EXISTS trigger_invoice_due_date ON public.invoice;
DROP TRIGGER IF EXISTS trigger_bl_order_recompute_invoice_due_dates ON public.bl_order;
DROP TRIGGER IF EXISTS trigger_bl_extraction_recompute_due_dates ON public.bl_extraction;
DROP TRIGGER IF EXISTS trigger_signature_recompute_due_dates ON public.document_signatures;
DROP TRIGGER IF EXISTS trigger_bl_order_downpayment_due_date ON public.bl_order;

-- Step 3: Rewrite resolve_invoice_trigger_date to lookup ticket data through relationship chain
CREATE OR REPLACE FUNCTION public.resolve_invoice_trigger_date(p_invoice_id bigint)
RETURNS date
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_invoice RECORD;
  v_bl_order RECORD;
  v_order RECORD;
  v_ticket RECORD;
  v_trigger_event text;
  v_trigger_date date;
BEGIN
  -- Get invoice details
  SELECT bl_order_name, order_id, invoice_direction, issue_date
  INTO v_invoice
  FROM invoice
  WHERE id = p_invoice_id;

  IF v_invoice IS NULL THEN
    RETURN NULL;
  END IF;

  -- Get bl_order
  SELECT id, ata, eta, etd, booking_date, bl_confirmed_date, bl_release_date, 
         customs_clearance, documents_sent_date, loading_date, order_id
  INTO v_bl_order
  FROM bl_order
  WHERE bl_order_name = v_invoice.bl_order_name
  LIMIT 1;

  -- Get order to find ticket IDs
  SELECT id, buyer, seller
  INTO v_order
  FROM public."order"
  WHERE id = COALESCE(v_bl_order.order_id, v_invoice.order_id);

  IF v_order IS NULL THEN
    RETURN NULL;
  END IF;

  -- Get the appropriate ticket based on invoice direction
  -- payable (buy side) -> buyer ticket, receivable (sell side) -> seller ticket
  IF v_invoice.invoice_direction = 'payable' AND v_order.buyer IS NOT NULL THEN
    SELECT payment_trigger_event, payment_offset_days
    INTO v_ticket
    FROM ticket
    WHERE id = v_order.buyer::bigint;
  ELSIF v_invoice.invoice_direction = 'receivable' AND v_order.seller IS NOT NULL THEN
    SELECT payment_trigger_event, payment_offset_days
    INTO v_ticket
    FROM ticket
    WHERE id = v_order.seller::bigint;
  END IF;

  IF v_ticket IS NULL OR v_ticket.payment_trigger_event IS NULL THEN
    RETURN NULL;
  END IF;

  v_trigger_event := LOWER(TRIM(v_ticket.payment_trigger_event::text));

  -- Map trigger event to date source
  CASE v_trigger_event
    WHEN 'ata' THEN
      v_trigger_date := v_bl_order.ata;
    WHEN 'bl confirmed' THEN
      v_trigger_date := v_bl_order.bl_confirmed_date;
    WHEN 'bl issued' THEN
      SELECT bl_issue_date INTO v_trigger_date 
      FROM bl_extraction 
      WHERE bl_order_id = v_bl_order.id 
      LIMIT 1;
    WHEN 'bl released' THEN
      v_trigger_date := v_bl_order.bl_release_date;
    WHEN 'booking' THEN
      v_trigger_date := v_bl_order.booking_date;
    WHEN 'customs clearance' THEN
      v_trigger_date := v_bl_order.customs_clearance;
    WHEN 'dp' THEN
      v_trigger_date := v_bl_order.documents_sent_date;
    WHEN 'eta' THEN
      v_trigger_date := v_bl_order.eta;
    WHEN 'etd' THEN
      v_trigger_date := v_bl_order.etd;
    WHEN 'inspection' THEN
      v_trigger_date := v_bl_order.ata;
    WHEN 'invoice' THEN
      v_trigger_date := v_invoice.issue_date;
    WHEN 'loading' THEN
      SELECT loading_date INTO v_trigger_date 
      FROM bl_extraction 
      WHERE bl_order_id = v_bl_order.id 
      LIMIT 1;
    WHEN 'order signed date' THEN
      SELECT completed_at::date INTO v_trigger_date 
      FROM document_signatures 
      WHERE reference_id = v_order.id 
        AND status = 'completed'
      ORDER BY completed_at DESC
      LIMIT 1;
    ELSE
      RETURN NULL;
  END CASE;

  RETURN v_trigger_date;
END;
$function$;

-- Step 4: Rewrite compute_invoice_actual_due_date to get offset from ticket
CREATE OR REPLACE FUNCTION public.compute_invoice_actual_due_date(p_invoice_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_invoice RECORD;
  v_bl_order RECORD;
  v_order RECORD;
  v_ticket RECORD;
  v_trigger_date date;
  v_offset_days integer;
  v_original_due_date date;
  v_actual_due_date date;
  v_is_fallback boolean := false;
BEGIN
  -- Get invoice details
  SELECT bl_order_name, order_id, invoice_direction, original_due_date
  INTO v_invoice
  FROM invoice
  WHERE id = p_invoice_id;

  IF v_invoice IS NULL THEN
    RETURN;
  END IF;

  -- Get bl_order
  SELECT id, order_id
  INTO v_bl_order
  FROM bl_order
  WHERE bl_order_name = v_invoice.bl_order_name
  LIMIT 1;

  -- Get order to find ticket IDs
  SELECT id, buyer, seller
  INTO v_order
  FROM public."order"
  WHERE id = COALESCE(v_bl_order.order_id, v_invoice.order_id);

  -- Get the appropriate ticket based on invoice direction
  IF v_order IS NOT NULL THEN
    IF v_invoice.invoice_direction = 'payable' AND v_order.buyer IS NOT NULL THEN
      SELECT payment_offset_days
      INTO v_ticket
      FROM ticket
      WHERE id = v_order.buyer::bigint;
    ELSIF v_invoice.invoice_direction = 'receivable' AND v_order.seller IS NOT NULL THEN
      SELECT payment_offset_days
      INTO v_ticket
      FROM ticket
      WHERE id = v_order.seller::bigint;
    END IF;
  END IF;

  v_offset_days := COALESCE(v_ticket.payment_offset_days, 0);
  v_original_due_date := v_invoice.original_due_date;

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
$function$;

-- Step 5: Rewrite resolve_downpayment_trigger_date to lookup ticket data
CREATE OR REPLACE FUNCTION public.resolve_downpayment_trigger_date(p_bl_order_id bigint)
RETURNS date
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_bl_order RECORD;
  v_order RECORD;
  v_ticket RECORD;
  v_trigger text;
  v_trigger_date date;
BEGIN
  -- Get bl_order details
  SELECT id, order_id, bl_release_date, booking_date
  INTO v_bl_order
  FROM bl_order
  WHERE id = p_bl_order_id;

  IF v_bl_order IS NULL OR v_bl_order.order_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Get order to find buyer ticket (downpayments are typically on buy side)
  SELECT id, buyer
  INTO v_order
  FROM public."order"
  WHERE id = v_bl_order.order_id;

  IF v_order IS NULL OR v_order.buyer IS NULL THEN
    RETURN NULL;
  END IF;

  -- Get downpayment_trigger from buyer ticket
  SELECT downpayment_trigger
  INTO v_ticket
  FROM ticket
  WHERE id = v_order.buyer::bigint;

  IF v_ticket IS NULL OR v_ticket.downpayment_trigger IS NULL THEN
    RETURN NULL;
  END IF;

  v_trigger := LOWER(TRIM(v_ticket.downpayment_trigger));

  -- Map trigger to date source
  CASE v_trigger
    WHEN 'against loading', 'loading' THEN
      SELECT loading_date INTO v_trigger_date 
      FROM bl_extraction 
      WHERE bl_order_id = p_bl_order_id 
      LIMIT 1;
    WHEN 'against release bl', 'bl released' THEN
      v_trigger_date := v_bl_order.bl_release_date;
    WHEN 'booking' THEN
      v_trigger_date := v_bl_order.booking_date;
    WHEN 'invoice' THEN
      SELECT issue_date INTO v_trigger_date 
      FROM invoice 
      WHERE order_id = v_order.id 
        AND LOWER(invoice_type) = 'downpayment'
      ORDER BY issue_date DESC
      LIMIT 1;
    WHEN 'order signed date' THEN
      SELECT completed_at::date INTO v_trigger_date 
      FROM document_signatures 
      WHERE reference_id = v_order.id 
        AND status = 'completed'
      ORDER BY completed_at DESC
      LIMIT 1;
    ELSE
      RETURN NULL;
  END CASE;

  RETURN v_trigger_date;
END;
$function$;

-- Step 6: Rewrite trigger functions for invoice
CREATE OR REPLACE FUNCTION public.trigger_compute_invoice_actual_due_date()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Recompute actual due date when relevant fields change
  IF TG_OP = 'INSERT' OR 
     OLD.original_due_date IS DISTINCT FROM NEW.original_due_date OR
     OLD.issue_date IS DISTINCT FROM NEW.issue_date OR
     OLD.bl_order_name IS DISTINCT FROM NEW.bl_order_name OR
     OLD.invoice_direction IS DISTINCT FROM NEW.invoice_direction THEN
    PERFORM compute_invoice_actual_due_date(NEW.id);
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Step 7: Create triggers
CREATE TRIGGER trigger_invoice_due_date
AFTER INSERT OR UPDATE ON public.invoice
FOR EACH ROW
EXECUTE FUNCTION trigger_compute_invoice_actual_due_date();

CREATE TRIGGER trigger_bl_order_recompute_invoice_due_dates
AFTER UPDATE ON public.bl_order
FOR EACH ROW
EXECUTE FUNCTION trigger_recompute_invoice_due_dates_on_bl_change();

CREATE TRIGGER trigger_bl_order_downpayment_due_date
AFTER INSERT OR UPDATE ON public.bl_order
FOR EACH ROW
EXECUTE FUNCTION trigger_compute_downpayment_due_date();

CREATE TRIGGER trigger_bl_extraction_recompute_due_dates
AFTER UPDATE ON public.bl_extraction
FOR EACH ROW
EXECUTE FUNCTION trigger_recompute_due_dates_on_extraction_change();

CREATE TRIGGER trigger_signature_recompute_due_dates
AFTER UPDATE ON public.document_signatures
FOR EACH ROW
EXECUTE FUNCTION trigger_recompute_due_dates_on_signature_complete();