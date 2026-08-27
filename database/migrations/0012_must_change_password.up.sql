-- First-login / admin-reset password gate. Existing accounts stay usable:
-- the flag defaults to FALSE so seed and live users are not forced to rotate.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN users.must_change_password IS
    'TRUE after admin create or password reset. The user must change their password before any other authenticated action. Never store or return the plaintext password; only this flag and password_hash are persisted.';
