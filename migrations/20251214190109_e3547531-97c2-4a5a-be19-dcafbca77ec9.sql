UPDATE document_templates 
SET content = REPLACE(
  content,
  '.signature-block { margin-top: 50px; }',
  '.notes { margin-top: 20px; }
    .notes__title { font-weight: bold; margin-bottom: 8px; font-size: 12px; }
    .notes__body { font-size: 12px; line-height: 1.6; }

    .signature-block { margin-top: 50px; }'
),
updated_at = now()
WHERE id = 'e3ee6e8f-74d7-4414-ba3b-ec8d1b9188fb';