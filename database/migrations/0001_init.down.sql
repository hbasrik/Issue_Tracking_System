-- Reverse the Karea initial schema in dependency-safe order.

-- Analysis views
DROP VIEW IF EXISTS vw_vehicle_completion_split;
DROP VIEW IF EXISTS vw_issues_pending_quality_approval;
DROP VIEW IF EXISTS vw_vehicle_open_issue_severity_breakdown;
DROP VIEW IF EXISTS vw_issue_mttr;
DROP VIEW IF EXISTS vw_defect_rate_per_station;
DROP VIEW IF EXISTS vw_completed_issues_daily;
DROP VIEW IF EXISTS vw_daily_pending_issues;

-- Triggers
DROP TRIGGER IF EXISTS trg_link_latest_issue_to_source ON issue_list;
DROP TRIGGER IF EXISTS trg_enforce_manual_status_change ON vehicles;
DROP TRIGGER IF EXISTS trg_check_shipment_completion ON eol_and_shipment_checklist_progress;
DROP TRIGGER IF EXISTS trg_recheck_eol_gate ON eol_and_shipment_checklist_progress;
DROP TRIGGER IF EXISTS trg_recalculate_vehicle_progress ON production_phase_progress;
DROP TRIGGER IF EXISTS trg_initialize_vehicle_progress ON vehicles;
DROP TRIGGER IF EXISTS trg_assign_checklist_templates ON vehicles;
DROP TRIGGER IF EXISTS trg_eol_ship_updated_at ON eol_and_shipment_checklist_progress;
DROP TRIGGER IF EXISTS trg_ppp_updated_at ON production_phase_progress;
DROP TRIGGER IF EXISTS trg_issue_list_updated_at ON issue_list;
DROP TRIGGER IF EXISTS trg_vehicles_updated_at ON vehicles;

-- Trigger and helper functions
DROP FUNCTION IF EXISTS fn_link_latest_issue_to_source();
DROP FUNCTION IF EXISTS fn_enforce_manual_status_change();
DROP FUNCTION IF EXISTS fn_check_shipment_completion();
DROP FUNCTION IF EXISTS fn_recheck_eol_gate_on_item_update();
DROP FUNCTION IF EXISTS fn_recalculate_vehicle_progress();
DROP FUNCTION IF EXISTS fn_initialize_vehicle_progress();
DROP FUNCTION IF EXISTS fn_assign_checklist_templates();
DROP FUNCTION IF EXISTS set_updated_at();
DROP FUNCTION IF EXISTS immutable_utc_date(TIMESTAMPTZ);

-- Tables in foreign-key-safe reverse order
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS eol_and_shipment_checklist_progress;
DROP TABLE IF EXISTS production_phase_progress;
DROP TABLE IF EXISTS issue_list;
DROP TABLE IF EXISTS vehicles;
DROP TABLE IF EXISTS checklist_template_items;
DROP TABLE IF EXISTS checklist_templates;
DROP TABLE IF EXISTS issue_types;
DROP TABLE IF EXISTS checkpoints;
DROP TABLE IF EXISTS stations;
DROP TABLE IF EXISTS phases;
DROP TABLE IF EXISTS vehicle_models;
DROP TABLE IF EXISTS users;

-- Enum types
DROP TYPE IF EXISTS audit_event_enum;
DROP TYPE IF EXISTS issue_source_enum;
DROP TYPE IF EXISTS issue_severity_enum;
DROP TYPE IF EXISTS issue_status_enum;
DROP TYPE IF EXISTS checklist_type_enum;
DROP TYPE IF EXISTS check_status_enum;
DROP TYPE IF EXISTS checkpoint_status_enum;
DROP TYPE IF EXISTS vehicle_status_enum;
DROP TYPE IF EXISTS user_role_enum;

-- Extensions
DROP EXTENSION IF EXISTS "uuid-ossp";
DROP EXTENSION IF EXISTS pg_trgm;
