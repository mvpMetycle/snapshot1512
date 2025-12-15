UPDATE document_templates 
SET content = REPLACE(
  content,
  '{{document_notes_section}}',
  '<div class="notes">
  <div class="notes__title">Notes / Special Instructions</div>
  <div class="notes__body">{{document_comment}}</div>
</div>'
),
updated_at = now()
WHERE id = 'e3ee6e8f-74d7-4414-ba3b-ec8d1b9188fb';