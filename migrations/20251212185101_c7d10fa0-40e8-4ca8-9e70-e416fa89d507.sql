-- 1. Deactivate the old BLI Template
UPDATE document_templates 
SET is_active = false 
WHERE name = 'BLI Template' OR name = 'BLI template' OR name = 'Bill of Lading Instructions';

-- 2. Add document_type column to generated_documents for uploaded docs
ALTER TABLE generated_documents ADD COLUMN IF NOT EXISTS document_type TEXT;

-- 3. Add comment explaining the column
COMMENT ON COLUMN generated_documents.document_type IS 'Document type for uploaded documents (Completed BL Instructions, Booking Confirmation, Other). NULL for template-generated documents.';