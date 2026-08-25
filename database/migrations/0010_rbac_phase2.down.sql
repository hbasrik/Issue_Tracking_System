-- Reverse 0010: drop QUALITY/ASSEMBLY (and their grants via ON DELETE
-- CASCADE) and restore the phase-1 permission codes.

DELETE FROM users WHERE role_id IN (SELECT id FROM roles WHERE code IN ('QUALITY', 'ASSEMBLY'));
DELETE FROM roles WHERE code IN ('QUALITY', 'ASSEMBLY');

INSERT INTO permissions (code, description) VALUES
    ('station_step.update', 'Tick station step status'),
    ('checklist_item.update', 'Update EOL/Shipment/Test checklist item status'),
    ('issue.transition.in_progress', 'Move an issue OPEN -> IN_PROGRESS'),
    ('issue.transition.done', 'Move an issue IN_PROGRESS -> DONE')
ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO role_permissions (role_id, permission_id)
SELECT rp.role_id, np.id
FROM role_permissions rp
JOIN permissions oldp ON oldp.id = rp.permission_id
JOIN permissions np ON np.code = CASE oldp.code
    WHEN 'station.step.edit' THEN 'station_step.update'
    WHEN 'issue.transition.progress' THEN 'issue.transition.in_progress'
END
WHERE oldp.code IN ('station.step.edit', 'issue.transition.progress')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT rp.role_id, np.id
FROM role_permissions rp
JOIN permissions oldp ON oldp.id = rp.permission_id
JOIN permissions np ON np.code = 'issue.transition.done'
WHERE oldp.code = 'issue.transition.progress'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT DISTINCT rp.role_id, np.id
FROM role_permissions rp
JOIN permissions oldp ON oldp.id = rp.permission_id
JOIN permissions np ON np.code = 'checklist_item.update'
WHERE oldp.code IN (
    'checklist.test.edit',
    'checklist.shipment.edit',
    'checklist.eol.edit'
)
ON CONFLICT DO NOTHING;

DELETE FROM permissions
WHERE code IN (
    'mobile.access',
    'web.access',
    'station.step.edit',
    'checklist.test.view',
    'checklist.test.edit',
    'checklist.shipment.view',
    'checklist.shipment.edit',
    'checklist.eol.view',
    'checklist.eol.edit',
    'issue.view',
    'issue.transition.progress',
    'admin.manage_users'
);
