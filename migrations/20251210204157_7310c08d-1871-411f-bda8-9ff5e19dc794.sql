-- Fix ticket #99 status (all required approvers have approved)
UPDATE approval_requests 
SET status = 'Approved', updated_at = now() 
WHERE id = '178ad1df-9307-45e7-afee-4cd4e4f240b5';

UPDATE ticket 
SET status = 'Approved' 
WHERE id = 99;