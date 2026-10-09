-- Counts the Analysis page and the issue lists read, plus checklist rows by
-- type, after seeds 01-06. Run against a *_test database only.
\pset footer off
SELECT 'issues_total' AS metric, count(*) AS n FROM issue_list;
SELECT status, count(*) AS n FROM issue_list GROUP BY 1 ORDER BY 1;
SELECT severity, count(*) AS n FROM issue_list GROUP BY 1 ORDER BY 1;
SELECT it.name AS issue_type, count(*) AS n
FROM issue_list il JOIN issue_types it ON it.id = il.issue_type_id GROUP BY 1 ORDER BY 1;
SELECT source_type, count(*) AS n FROM issue_list GROUP BY 1 ORDER BY 1;
SELECT right(vin, 5) AS vin_tail, status, severity, count(*) AS n
FROM issue_list GROUP BY 1, 2, 3 ORDER BY 1, 2, 3;
SELECT current_global_status, count(*) AS n FROM vehicles GROUP BY 1 ORDER BY 1;
SELECT w.current_stage, count(*) AS n FROM vehicle_eol_workflow w GROUP BY 1 ORDER BY 1;
SELECT ct.type, ct.name, ct.is_active, count(cti.id) AS items
FROM checklist_templates ct LEFT JOIN checklist_template_items cti ON cti.template_id = ct.id
GROUP BY 1, 2, 3 ORDER BY 1;
SELECT checklist_type, check_status, count(*) AS n
FROM checklist_item_progress GROUP BY 1, 2 ORDER BY 1, 2;
SELECT count(*) FILTER (WHERE shipment_template_id IS NOT NULL) AS vehicles_with_shipment_template,
       count(*) AS vehicles
FROM vehicles;
