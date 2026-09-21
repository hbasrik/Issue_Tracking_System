-- Reverse 0029: restore document_approve grants for MANAGER_ADMIN (the
-- pre-0029 CROSS JOIN effectively gave every permission to that role),
-- then drop the column.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.code = 'MANAGER_ADMIN'
  AND p.code = 'eol.document_approve'
ON CONFLICT DO NOTHING;

ALTER TABLE users DROP COLUMN IF EXISTS tokens_valid_from;
