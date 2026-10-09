package postgres

import (
	"strings"
	"testing"
)

// TestBranchShipTrigger_Gates drives fn_enforce_branch_shipment (migration
// 0044) with direct SQL on a schema without the Shipment checklist (0045): a
// vehicle whose station steps, EOL BRANCH and TEST items are all OK ships;
// taking away a TEST item, an EOL BRANCH item or a station step is refused,
// and a refused attempt leaves the workflow and vehicle rows unchanged.
// Rolled back.
func TestBranchShipTrigger_Gates(t *testing.T) {
	ctx, tx := stageTestTx(t)
	const vin = "TMPSHIPTRIG000001"

	exec := func(sql string, args ...any) {
		t.Helper()
		if _, err := tx.Exec(ctx, sql, args...); err != nil {
			t.Fatalf("%s: %v", sql, err)
		}
	}
	exec(`INSERT INTO vehicles (vin) VALUES ($1)`, vin)
	exec(`UPDATE vehicle_station_step_progress SET status = 'OK' WHERE vin = $1`, vin)
	exec(`UPDATE checklist_item_progress p SET check_status = 'OK'
	        FROM checklist_template_items c
	       WHERE c.id = p.check_item_id AND p.vin = $1
	         AND (p.checklist_type = 'TEST' OR (p.checklist_type = 'EOL' AND c.eol_phase = 'BRANCH'))`, vin)

	var shipmentRows int
	if err := tx.QueryRow(ctx, `SELECT count(*) FROM checklist_item_progress WHERE vin = $1 AND checklist_type = 'SHIPMENT'`, vin).Scan(&shipmentRows); err != nil {
		t.Fatal(err)
	}
	if shipmentRows != 0 {
		t.Fatalf("new vehicle got %d SHIPMENT row(s), want 0", shipmentRows)
	}

	rowsMD5 := func() string {
		t.Helper()
		var h string
		if err := tx.QueryRow(ctx, `
			SELECT md5(w::text) || '/' || md5(v::text)
			  FROM vehicle_eol_workflow w JOIN vehicles v ON v.vin = w.vin WHERE w.vin = $1`, vin).Scan(&h); err != nil {
			t.Fatal(err)
		}
		return h
	}
	const firstTest = `SELECT min(id) FROM checklist_item_progress WHERE vin = $1 AND checklist_type = 'TEST'`
	const firstBranch = `SELECT min(p.id) FROM checklist_item_progress p JOIN checklist_template_items c ON c.id = p.check_item_id
	                      WHERE p.vin = $1 AND p.checklist_type = 'EOL' AND c.eol_phase = 'BRANCH'`

	cases := []struct {
		name    string
		breakIt string
		wantErr string // "" = accepted
	}{
		{"all gates done", ``, ""},
		{"test item missing", `DELETE FROM checklist_item_progress WHERE id = (` + firstTest + `)`, "test checklist item(s) not yet on the vehicle"},
		{"test item NOT_OK", `UPDATE checklist_item_progress SET check_status = 'NOT_OK', rejected_desc = 'probe' WHERE id = (` + firstTest + `)`, "test checklist is not fully OK/CONDITIONAL_OK"},
		{"branch EOL item missing", `DELETE FROM checklist_item_progress WHERE id = (` + firstBranch + `)`, "branch-phase EoL item(s) not yet on the vehicle"},
		{"branch EOL item NOT_OK", `UPDATE checklist_item_progress SET check_status = 'NOT_OK', rejected_desc = 'probe' WHERE id = (` + firstBranch + `)`, "branch-phase EoL items are not all OK/CONDITIONAL_OK"},
		{"station step PENDING", `UPDATE vehicle_station_step_progress SET status = 'PENDING' WHERE id = (SELECT min(id) FROM vehicle_station_step_progress WHERE vin = $1)`, "station step(s) still incomplete"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			sp, err := tx.Begin(ctx)
			if err != nil {
				t.Fatal(err)
			}
			defer func() { _ = sp.Rollback(ctx) }()
			if tc.breakIt != "" {
				if _, err := sp.Exec(ctx, tc.breakIt, vin); err != nil {
					t.Fatalf("break: %v", err)
				}
			}
			before := rowsMD5()

			probe, err := sp.Begin(ctx)
			if err != nil {
				t.Fatal(err)
			}
			_, shipErr := probe.Exec(ctx, `
				UPDATE vehicle_eol_workflow
				   SET branch_shipped_at = now(), branch_shipped_by = (SELECT min(id) FROM users)
				 WHERE vin = $1`, vin)

			if tc.wantErr == "" {
				if shipErr != nil {
					t.Fatalf("ship with every gate done must pass the trigger: %v", shipErr)
				}
				var stage, status string
				if err := probe.QueryRow(ctx, `
					SELECT w.current_stage::text, v.current_global_status::text
					  FROM vehicle_eol_workflow w JOIN vehicles v ON v.vin = w.vin WHERE w.vin = $1`, vin).Scan(&stage, &status); err != nil {
					t.Fatal(err)
				}
				if stage != "DEPOT" || status != "IN_WAREHOUSE" {
					t.Errorf("after ship: stage=%s status=%s", stage, status)
				}
				t.Logf("accepted: stage=%s status=%s", stage, status)
				_ = probe.Rollback(ctx)
				return
			}
			_ = probe.Rollback(ctx)
			if shipErr == nil || !strings.Contains(shipErr.Error(), tc.wantErr) {
				t.Fatalf("err = %v, want %q", shipErr, tc.wantErr)
			}
			if after := rowsMD5(); after != before {
				t.Errorf("refused attempt changed rows: %s -> %s", before, after)
			}
			t.Logf("refused (%s), rows md5 %s unchanged", tc.wantErr, before)
		})
	}
}
