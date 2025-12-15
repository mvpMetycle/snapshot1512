UPDATE document_templates
SET content = REPLACE(
  REPLACE(
    content,
    '<p>{{consignee_name}}</p>
          <p>{{consignee_address}}</p>
          <p>VAT ID: {{consignee_vat_id}}</p>
          <p>PAN: {{consignee_pan_number}}</p>
          <p>IEC: {{consignee_iec_code}}</p>',
    '<p>{{consignee_name}}</p>
          <p>{{consignee_address}}</p>
          {{consignee_vat_line}}
          {{consignee_pan_line}}
          {{consignee_iec_line}}'
  ),
  '<p>{{consignee_name}}</p>
          <p>{{consignee_address}}</p>
          <p>VAT ID: {{consignee_vat_id}}</p>
          <p>PAN: {{consignee_pan_number}}</p>
          <p>IEC: {{consignee_iec_code}}</p>',
  '<p>{{consignee_name}}</p>
          <p>{{consignee_address}}</p>
          {{consignee_vat_line}}
          {{consignee_pan_line}}
          {{consignee_iec_line}}'
),
updated_at = now()
WHERE id = '29453cef-8c60-4a80-98a1-a426e8ce2c81'