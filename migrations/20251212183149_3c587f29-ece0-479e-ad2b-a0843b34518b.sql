UPDATE document_templates 
SET content = REPLACE(
  content, 
  '{{#comment}}
<div class="section">
  <h3>Comment</h3>
  <p>{{comment}}</p>
</div>
{{/comment}}',
  '{{document_notes_section}}'
)
WHERE id = 'e3ee6e8f-74d7-4414-ba3b-ec8d1b9188fb';