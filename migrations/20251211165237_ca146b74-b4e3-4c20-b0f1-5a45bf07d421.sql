-- Add onboard_date to bl_extraction (shipment-level)
ALTER TABLE public.bl_extraction 
ADD COLUMN IF NOT EXISTS onboard_date date;

-- Add container_size to bl_extraction_container (per container)
ALTER TABLE public.bl_extraction_container 
ADD COLUMN IF NOT EXISTS container_size text;

-- Add comment for clarity
COMMENT ON COLUMN public.bl_extraction.onboard_date IS 'On-board date from BL document';
COMMENT ON COLUMN public.bl_extraction_container.container_size IS 'Container size (e.g., 20GP, 40HC, 40GP)';