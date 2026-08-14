-- Local development users.
--
-- SECURITY: The password_hash below is a bcrypt hash (cost 10) of the
-- placeholder password "changeme123". It is a LOCAL-DEV-ONLY convenience for
-- signing in against a fresh database. It MUST NEVER be reused in staging or
-- production; rotate/replace these credentials before any shared deployment.
INSERT INTO users (full_name, email, password_hash, role_id, is_active)
SELECT seed.full_name, seed.email, seed.password_hash, roles.id, TRUE
FROM (
    VALUES
        ('Local Manager', 'manager@karea.local', '$2y$10$dDgVqcYKPs379f/RYybsvufVx6q9QG88T48GJqcrxTBB3Z2huxdRe', 'MANAGER_ADMIN'),
        ('Assembly Operator', 'operator.one@karea.local', '$2y$10$dDgVqcYKPs379f/RYybsvufVx6q9QG88T48GJqcrxTBB3Z2huxdRe', 'OPERATOR'),
        ('Quality Operator', 'operator.two@karea.local', '$2y$10$dDgVqcYKPs379f/RYybsvufVx6q9QG88T48GJqcrxTBB3Z2huxdRe', 'OPERATOR')
) AS seed(full_name, email, password_hash, role_code)
JOIN roles ON roles.code = seed.role_code
ON CONFLICT (email) DO UPDATE
SET full_name = EXCLUDED.full_name,
    password_hash = EXCLUDED.password_hash,
    role_id = EXCLUDED.role_id,
    is_active = EXCLUDED.is_active;
