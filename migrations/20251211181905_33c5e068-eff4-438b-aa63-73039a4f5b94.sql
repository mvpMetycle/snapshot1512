UPDATE document_templates 
SET content = REPLACE(
  content, 
  '<p><strong>Pricing basis:</strong> {{basis_with_payable}}</p>', 
  '{{pricing_basis_line}}'
),
updated_at = now()
WHERE name = 'Sales Order';