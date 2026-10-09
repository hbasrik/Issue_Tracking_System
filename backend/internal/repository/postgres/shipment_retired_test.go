package postgres

import (
	"errors"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"
)

// TestShipmentChecklistSchemaRetired pins migration 0045 (Karar 33): no
// SHIPMENT template, no vehicles.shipment_template_id, no
// checklist.shipment.* permission, fn_materialize_vehicle_progress takes
// three arguments, and the CHECK refuses a new SHIPMENT template. Rolled
// back.
func TestShipmentChecklistSchemaRetired(t *testing.T) {
	ctx, tx := stageTestTx(t)

	counts := []struct {
		name, sql string
	}{
		{"SHIPMENT templates", `SELECT count(*) FROM checklist_templates WHERE type = 'SHIPMENT'`},
		{"SHIPMENT progress rows", `SELECT count(*) FROM checklist_item_progress WHERE checklist_type = 'SHIPMENT'`},
		{"vehicles.shipment_template_id", `SELECT count(*) FROM information_schema.columns WHERE table_name = 'vehicles' AND column_name = 'shipment_template_id'`},
		{"checklist.shipment.* permissions", `SELECT count(*) FROM permissions WHERE code LIKE 'checklist.shipment.%'`},
		{"4-argument fn_materialize_vehicle_progress", `SELECT count(*) FROM pg_proc WHERE proname = 'fn_materialize_vehicle_progress' AND pronargs = 4`},
	}
	for _, c := range counts {
		var n int
		if err := tx.QueryRow(ctx, c.sql).Scan(&n); err != nil {
			t.Fatalf("%s: %v", c.name, err)
		}
		if n != 0 {
			t.Errorf("%s = %d, want 0", c.name, n)
		}
	}

	sp, err := tx.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = sp.Rollback(ctx) }()
	_, err = sp.Exec(ctx, `INSERT INTO checklist_templates (type, name, is_active) VALUES ('SHIPMENT', 'TMP_0045_CHECK', FALSE)`)
	var pgErr *pgconn.PgError
	if !errors.As(err, &pgErr) || pgErr.Code != "23514" || pgErr.ConstraintName != "checklist_templates_type_not_shipment" {
		t.Fatalf("insert SHIPMENT template: err = %v, want check_violation on checklist_templates_type_not_shipment", err)
	}
}
