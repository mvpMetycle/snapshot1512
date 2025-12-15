-- Update Purchase Order template to use conditional delivery_location_line
UPDATE document_templates 
SET content = REPLACE(
  content, 
  '<p><strong>Delivery location:</strong> {{ship_to}}</p>', 
  '{{delivery_location_line}}'
)
WHERE name ILIKE '%purchase order%' AND is_active = true;