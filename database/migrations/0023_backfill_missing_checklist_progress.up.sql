-- Backfill PENDING progress for active template items missing on non-delivered
-- vehicles. Delivered vehicles are left untouched so completed history is not
-- rewritten. Idempotent via NOT EXISTS / ON CONFLICT.

INSERT INTO checklist_item_progress (vin, checklist_type, check_item_id, check_status)
SELECT v.vin, t.type, ci.id, 'PENDING'
FROM vehicles v
JOIN checklist_templates t ON t.id = v.shipment_template_id
JOIN checklist_template_items ci ON ci.template_id = t.id AND ci.is_active
WHERE v.current_global_status IS DISTINCT FROM 'DELIVERED'
  AND t.type = 'SHIPMENT'
  AND NOT EXISTS (
        SELECT 1 FROM checklist_item_progress p
        WHERE p.vin = v.vin AND p.check_item_id = ci.id
  )
ON CONFLICT (vin, check_item_id) DO NOTHING;

INSERT INTO checklist_item_progress (vin, checklist_type, check_item_id, check_status)
SELECT v.vin, t.type, ci.id, 'PENDING'
FROM vehicles v
JOIN checklist_templates t ON t.id = v.eol_template_id
JOIN checklist_template_items ci ON ci.template_id = t.id AND ci.is_active
WHERE v.current_global_status IS DISTINCT FROM 'DELIVERED'
  AND t.type = 'EOL'
  AND NOT EXISTS (
        SELECT 1 FROM checklist_item_progress p
        WHERE p.vin = v.vin AND p.check_item_id = ci.id
  )
ON CONFLICT (vin, check_item_id) DO NOTHING;

INSERT INTO checklist_item_progress (vin, checklist_type, check_item_id, check_status)
SELECT v.vin, t.type, ci.id, 'PENDING'
FROM vehicles v
JOIN checklist_templates t ON t.id = v.test_template_id
JOIN checklist_template_items ci ON ci.template_id = t.id AND ci.is_active
WHERE v.current_global_status IS DISTINCT FROM 'DELIVERED'
  AND t.type = 'TEST'
  AND NOT EXISTS (
        SELECT 1 FROM checklist_item_progress p
        WHERE p.vin = v.vin AND p.check_item_id = ci.id
  )
ON CONFLICT (vin, check_item_id) DO NOTHING;
