-- Local development users. Authentication credentials are introduced by the
-- backend authentication migration; this schema stores profile and role data.
INSERT INTO users (full_name, email, role, is_active)
VALUES
    ('Local Manager', 'manager@karea.local', 'MANAGER_ADMIN', TRUE),
    ('Assembly Operator', 'operator.one@karea.local', 'OPERATOR', TRUE),
    ('Quality Operator', 'operator.two@karea.local', 'OPERATOR', TRUE)
ON CONFLICT (email) DO UPDATE
SET full_name = EXCLUDED.full_name,
    role = EXCLUDED.role,
    is_active = EXCLUDED.is_active;
