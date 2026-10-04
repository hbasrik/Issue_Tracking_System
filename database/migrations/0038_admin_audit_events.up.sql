-- Management actions land in audit_logs (docs/11 Karar 25). They are not
-- tied to a vehicle, so vin stays NULL (nullable since 0028).
--
--   USER_ADMIN_CHANGE         user create / update / deactivate / delete,
--                             role assignment, admin password reset (the
--                             value is never stored), manual login unlock
--   ROLE_PERMISSION_CHANGE    role create, permission grants added/removed
--   CHECKLIST_TEMPLATE_CHANGE template item create / edit / (de)activate /
--                             delete / reorder / section change
--   DEFECT_CATALOG_CHANGE     zone / part / defect type / process create,
--                             rename, (de)activate, delete, code or zone
--                             change, reorder
--
-- ADD VALUE IF NOT EXISTS keeps the file idempotent. No existing row changes.

ALTER TYPE audit_event_enum ADD VALUE IF NOT EXISTS 'USER_ADMIN_CHANGE';
ALTER TYPE audit_event_enum ADD VALUE IF NOT EXISTS 'ROLE_PERMISSION_CHANGE';
ALTER TYPE audit_event_enum ADD VALUE IF NOT EXISTS 'CHECKLIST_TEMPLATE_CHANGE';
ALTER TYPE audit_event_enum ADD VALUE IF NOT EXISTS 'DEFECT_CATALOG_CHANGE';
