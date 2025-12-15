-- Add comment column to generated_documents table
ALTER TABLE public.generated_documents 
ADD COLUMN comment text NULL;

-- Add comment to track any operator notes about the document generation
COMMENT ON COLUMN public.generated_documents.comment IS 'Stores operator-entered comment prior to document generation';