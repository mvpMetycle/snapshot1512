UPDATE document_templates
SET content = REPLACE(
  REPLACE(
    content,
    '<h2>Purchaser</h2>
          <p>{{consignee_name}}</p>
          <p>{{consignee_address}}</p>',
    '<h2>Purchaser</h2>
          <p>{{consignee_name}}</p>
          <p>{{consignee_address}}</p>
          <p>VAT ID: {{consignee_vat_id}}</p>
          <p>PAN: {{consignee_pan_number}}</p>
          <p>IEC: {{consignee_iec_code}}</p>'
  ),
  '<h2>Applicant</h2>
          <p>{{consignee_name}}</p>
          <p>{{consignee_address}}</p>',
  '<h2>Applicant</h2>
          <p>{{consignee_name}}</p>
          <p>{{consignee_address}}</p>
          <p>VAT ID: {{consignee_vat_id}}</p>
          <p>PAN: {{consignee_pan_number}}</p>
          <p>IEC: {{consignee_iec_code}}</p>'
),
updated_at = now()
WHERE id = '29453cef-8c60-4a80-98a1-a426e8ce2c81'