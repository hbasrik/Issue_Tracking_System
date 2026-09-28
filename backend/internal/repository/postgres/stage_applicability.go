package postgres

import "fmt"

// Stage applicability is the single rule shared by template-item
// distribution, the pre-shipment warning list and the vehicle progress
// percentage, so the three can never disagree.
//
// Every checklist item and station step belongs to the stage whose gate
// guards it (migration 0022): station steps, TEST, SHIPMENT and EOL BRANCH
// items gate branch ship; EOL DEPOT items gate depot release. A vehicle has
// passed that stage once the workflow stamp is set, or once it is terminal
// (DELIVERED / legacy SHIPPED).
//
// Applicable set of a vehicle:
//   - stage not passed: every active item (a missing row counts as pending,
//     exactly like the gate);
//   - stage passed: rows that were never evaluated (missing or PENDING) are
//     not applicable — they were added after the stage;
//   - terminal vehicle: only passing rows remain; history is frozen.

// vehicleTerminalSQL is true when the vehicle alias v is delivered.
func vehicleTerminalSQL(v string) string {
	return fmt.Sprintf(`%s.current_global_status IN ('DELIVERED', 'SHIPPED')`, v)
}

// checklistStagePassedSQL is true when vehicle v (workflow w, LEFT JOIN, may
// be NULL) has passed the stage of an item with the given checklist type and
// EOL phase expressions.
func checklistStagePassedSQL(v, w, typ, phase string) string {
	return fmt.Sprintf(`(%[1]s
	 OR CASE WHEN %[3]s::text = 'EOL' AND %[4]s::text = 'DEPOT'
	         THEN %[2]s.depot_released_at IS NOT NULL
	         ELSE %[2]s.branch_shipped_at IS NOT NULL
	    END)`, vehicleTerminalSQL(v), w, typ, phase)
}

// checklistStageClosedSQL is true when an item (progress alias p, LEFT JOIN,
// may be NULL) is outside the applicable set: its stage is passed and it was
// never evaluated, or the vehicle is terminal and the row is not passing.
// Such items count nowhere — no progress, no gate, no warning.
func checklistStageClosedSQL(v, w, typ, phase, p string) string {
	return fmt.Sprintf(`(%[1]s AND (
	        %[2]s.id IS NULL
	        OR %[2]s.check_status = 'PENDING'
	        OR (%[3]s AND %[2]s.check_status NOT IN ('OK', 'CONDITIONAL_OK'))
	  ))`, checklistStagePassedSQL(v, w, typ, phase), p, vehicleTerminalSQL(v))
}

// applicableChecklistItemsSQL selects the applicable checklist items of the
// vehicle whose VIN is vinExpr (a parameter or an outer column).
func applicableChecklistItemsSQL(vinExpr string) string {
	return fmt.Sprintf(`
		SELECT t.type::text AS checklist_type, cti.id AS item_id, cti.item_no,
		       COALESCE(NULLIF(trim(p.item_text_snapshot), ''), cti.item_text) AS item_text,
		       COALESCE(p.check_status::text, 'PENDING') AS status,
		       cti.eol_phase::text AS eol_phase, p.id AS progress_id
		FROM vehicles av
		JOIN checklist_template_items cti
		  ON cti.is_active
		 AND cti.template_id IN (av.eol_template_id, av.shipment_template_id, av.test_template_id)
		JOIN checklist_templates t ON t.id = cti.template_id
		LEFT JOIN vehicle_eol_workflow aw ON aw.vin = av.vin
		LEFT JOIN checklist_item_progress p ON p.check_item_id = cti.id AND p.vin = av.vin
		WHERE av.vin = %[1]s
		  AND NOT %[2]s`, vinExpr, checklistStageClosedSQL("av", "aw", "t.type", "cti.eol_phase", "p"))
}

// applicableStationStepsSQL selects the applicable station-step rows (status)
// of the vehicle whose VIN is vinExpr. Station steps gate branch ship.
func applicableStationStepsSQL(vinExpr string) string {
	passed := fmt.Sprintf(`(%s OR sw.branch_shipped_at IS NOT NULL)`, vehicleTerminalSQL("sv"))
	return fmt.Sprintf(`
		SELECT s.status::text AS status
		FROM vehicle_station_step_progress s
		JOIN vehicles sv ON sv.vin = s.vin
		LEFT JOIN vehicle_eol_workflow sw ON sw.vin = s.vin
		WHERE s.vin = %[1]s
		  AND NOT (%[2]s AND (
		        s.status = 'PENDING'
		        OR (%[3]s AND s.status <> 'OK')
		  ))`, vinExpr, passed, vehicleTerminalSQL("sv"))
}

// vehicleProgressSQL is the completion percentage over the applicable station
// steps and checklist items of vinExpr (passing / applicable, two decimals).
func vehicleProgressSQL(vinExpr string) string {
	return fmt.Sprintf(`(SELECT COALESCE(round(100.0 * count(*) FILTER (WHERE u.passed) / NULLIF(count(*), 0), 2), 0)::numeric(5,2)
		FROM (
		  SELECT st.status = 'OK' AS passed FROM (%[1]s) st
		  UNION ALL
		  SELECT ci.status IN ('OK', 'CONDITIONAL_OK') FROM (%[2]s) ci
		) u)`, applicableStationStepsSQL(vinExpr), applicableChecklistItemsSQL(vinExpr))
}
