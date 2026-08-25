-- Karar 3 phase 2: granular permission catalogue, QUALITY + ASSEMBLY roles.
-- Existing OPERATOR and MANAGER_ADMIN users are not rewritten; their grants
-- are mapped onto the new codes so behaviour stays the same.

INSERT INTO permissions (code, description) VALUES
    ('mobile.access', 'Sign in to the mobile app'),
    ('web.access', 'Sign in to the web dashboard'),
    ('station.step.edit', 'Tick station step status'),
    ('checklist.test.view', 'View the Test checklist'),
    ('checklist.test.edit', 'Update Test checklist items'),
    ('checklist.shipment.view', 'View the Shipment checklist'),
    ('checklist.shipment.edit', 'Update Shipment checklist items'),
    ('checklist.eol.view', 'View the EoL checklist'),
    ('checklist.eol.edit', 'Update EoL checklist items'),
    ('issue.view', 'View the issue queue and issue detail'),
    ('issue.transition.progress', 'Move an issue OPEN -> IN_PROGRESS -> DONE'),
    ('admin.manage_users', 'Manage users, roles, and the permission matrix')
ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description;

-- Map retired codes onto their replacements for every role that held them.
INSERT INTO role_permissions (role_id, permission_id)
SELECT rp.role_id, np.id
FROM role_permissions rp
JOIN permissions oldp ON oldp.id = rp.permission_id
JOIN permissions np ON np.code = CASE oldp.code
    WHEN 'station_step.update' THEN 'station.step.edit'
    WHEN 'issue.transition.in_progress' THEN 'issue.transition.progress'
    WHEN 'issue.transition.done' THEN 'issue.transition.progress'
END
WHERE oldp.code IN (
    'station_step.update',
    'issue.transition.in_progress',
    'issue.transition.done'
)
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT rp.role_id, np.id
FROM role_permissions rp
JOIN permissions oldp ON oldp.id = rp.permission_id
JOIN permissions np ON np.code IN (
    'checklist.test.view',
    'checklist.test.edit',
    'checklist.shipment.view',
    'checklist.shipment.edit',
    'checklist.eol.view',
    'checklist.eol.edit'
)
WHERE oldp.code = 'checklist_item.update'
ON CONFLICT DO NOTHING;

-- OPERATOR keeps shop-floor access, now including the mobile shell and
-- issue.view (the queue previously sat on vehicle.view).
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN ('mobile.access', 'issue.view')
WHERE r.code = 'OPERATOR'
ON CONFLICT DO NOTHING;

INSERT INTO roles (code, name) VALUES
    ('QUALITY', 'Quality'),
    ('ASSEMBLY', 'Assembly')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
    'mobile.access',
    'vehicle.view',
    'issue.view',
    'issue.transition.approve',
    'issue.transition.conditional_approve',
    'checklist.test.view',
    'checklist.test.edit'
)
WHERE r.code = 'QUALITY'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
    'mobile.access',
    'vehicle.view',
    'issue.view',
    'issue.create',
    'issue.transition.progress',
    'station.step.edit',
    'checklist.shipment.view',
    'checklist.shipment.edit'
)
WHERE r.code = 'ASSEMBLY'
ON CONFLICT DO NOTHING;

-- MANAGER_ADMIN keeps full access, including the new codes (mobile.access,
-- web.access, admin.manage_users, split checklists, …).
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.code = 'MANAGER_ADMIN'
ON CONFLICT DO NOTHING;

DELETE FROM permissions
WHERE code IN (
    'station_step.update',
    'checklist_item.update',
    'issue.transition.in_progress',
    'issue.transition.done'
);
