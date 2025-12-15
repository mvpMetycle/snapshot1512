-- Update Certificate of Origin
UPDATE document_templates 
SET content = REPLACE(
  content, 
  '<div class="notes">
  <div class="notes__title">Notes / Special Instructions: </div>
  <div class="notes__body">{{document_comment}}</div>
</div>', 
  '{{document_notes_section}}'
)
WHERE id = 'e3ee6e8f-74d7-4414-ba3b-ec8d1b9188fb';

-- Update Freight Certificate
UPDATE document_templates 
SET content = REPLACE(
  content, 
  '<div class="notes">
  <div class="notes__title">Notes / Special Instructions: </div>
  <div class="notes__body">{{document_comment}}</div>
</div>', 
  '{{document_notes_section}}'
)
WHERE id = '9947da39-527c-4b96-8789-e5b71ccde92b';

-- Update Non-Radioactive and No War Certificate
UPDATE document_templates 
SET content = REPLACE(
  content, 
  '<div class="notes">
  <div class="notes__title">Notes / Special Instructions: </div>
  <div class="notes__body">{{document_comment}}</div>
</div>', 
  '{{document_notes_section}}'
)
WHERE id = '74f8a6be-eb91-4213-8b5a-7db43ac8e4d1';

-- Update Packing List
UPDATE document_templates 
SET content = REPLACE(
  content, 
  '<div class="notes">
  <div class="notes__title">Notes / Special Instructions: </div>
  <div class="notes__body">{{document_comment}}</div>
</div>', 
  '{{document_notes_section}}'
)
WHERE id = '29453cef-8c60-4a80-98a1-a426e8ce2c81';

-- Update Freight Insurance
UPDATE document_templates 
SET content = REPLACE(
  content, 
  '<div class="notes">
  <div class="notes__title">Notes / Special Instructions: </div>
  <div class="notes__body">{{document_comment}}</div>
</div>', 
  '{{document_notes_section}}'
)
WHERE id = '640c55f9-84e9-46b7-9ca0-27916f0bd0fd';