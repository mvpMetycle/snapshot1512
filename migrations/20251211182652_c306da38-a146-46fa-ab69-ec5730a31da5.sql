UPDATE document_templates 
SET content = REPLACE(
  content, 
  '<p><strong>Pricing basis:</strong> {{pricing_basis_line}}</p>', 
  '<p><strong>Pricing basis:</strong> {{pricing_basis_line}}</p>
        <p><strong>Payment terms:</strong> {{formatted_payment_terms}}</p>'
),
updated_at = now()
WHERE name = 'Purchase Order';