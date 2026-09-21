-- Token revocation stamp (security hardening).
-- When a user is deactivated, deleted, has their password changed/reset,
-- or their role changes, tokens_valid_from is set to now() so JWTs with
-- an earlier iat are rejected (401) without waiting for the 24h TTL.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS tokens_valid_from TIMESTAMPTZ NOT NULL DEFAULT now();

-- Sleep eol.document_approve: revoke from every role. The permission row
-- stays in the catalogue for historical reference but is no longer
-- assignable via the Roles API (filtered in application code).
DELETE FROM role_permissions
WHERE permission_id = (
    SELECT id FROM permissions WHERE code = 'eol.document_approve'
);
