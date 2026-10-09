package postgres

import (
	"context"
	"math"
	"testing"

	"github.com/jackc/pgx/v5"

	"github.com/karea/backend/internal/domain"
)

// openApplicable counts the vehicle's applicable items (station steps +
// checklist items, stage rule) and how many of them are not passing, through
// the same repository calls the pre-shipment warning list uses.
func openApplicable(ctx context.Context, t *testing.T, tx pgx.Tx, vin string) (open, applicable int) {
	t.Helper()
	steps := &StationStepProgressRepo{}
	checklists := &ChecklistProgressRepo{}
	open, err := steps.CountApplicableOpen(ctx, vin)
	if err != nil {
		t.Fatal(err)
	}
	if err := tx.QueryRow(ctx, `SELECT count(*)::int FROM (`+applicableStationStepsSQL("$1")+`) s`, vin).Scan(&applicable); err != nil {
		t.Fatal(err)
	}
	for _, typ := range []domain.ChecklistType{domain.ChecklistTypeEOL, domain.ChecklistTypeTest} {
		items, err := checklists.ListApplicableItems(ctx, vin, typ)
		if err != nil {
			t.Fatal(err)
		}
		applicable += len(items)
		for _, it := range items {
			if !it.Status.IsPassing() {
				open++
			}
		}
	}
	return open, applicable
}

// Progress covers all work up to depot release — station steps, EOL branch,
// TEST and EOL depot items — and reads 100% only when none is open.
// A new template item lowers it exactly for vehicles whose stage is still
// open, before and after distribution.
func TestProgress_HundredOnlyAfterDepotItems(t *testing.T) {
	ctx, tx := stageTestTx(t)
	vehicles := &VehicleRepo{}
	checklists := &ChecklistProgressRepo{}

	const (
		released = "TMPPROGRESS000001" // depot items done, released
		awaiting = "TMPPROGRESS000002" // branch shipped, depot items pending
		onLine   = "TMPPROGRESS000003" // everything but depot done, still on the line
	)
	all := []string{released, awaiting, onLine}
	exec := func(sql string, args ...any) {
		t.Helper()
		if _, err := tx.Exec(ctx, sql, args...); err != nil {
			t.Fatalf("%s: %v", sql, err)
		}
	}
	type snap struct {
		pct              float64
		open, applicable int
	}
	check := func(label, vin string) snap {
		t.Helper()
		v, err := vehicles.GetByVIN(ctx, vin)
		if err != nil {
			t.Fatal(err)
		}
		open, applicable := openApplicable(ctx, t, tx, vin)
		want := 0.0
		if applicable > 0 {
			want = math.Round(10000*float64(applicable-open)/float64(applicable)) / 100
		}
		if math.Abs(v.TotalProgressPercentage-want) > 0.005 {
			t.Errorf("%s %s: progress %.2f, open %d of %d → want %.2f", label, vin, v.TotalProgressPercentage, open, applicable, want)
		}
		if (v.TotalProgressPercentage == 100) != (open == 0) {
			t.Errorf("%s %s: progress %.2f contradicts %d open item(s)", label, vin, v.TotalProgressPercentage, open)
		}
		t.Logf("%-28s %s %-13s progress=%6.2f open=%d applicable=%d", label, vin, v.CurrentGlobalStatus, v.TotalProgressPercentage, open, applicable)
		return snap{v.TotalProgressPercentage, open, applicable}
	}
	depotItems := func(vin string) int {
		t.Helper()
		var n int
		if err := tx.QueryRow(ctx, `
			SELECT count(*)::int FROM checklist_template_items c JOIN vehicles v ON v.eol_template_id = c.template_id
			WHERE v.vin = $1 AND c.is_active AND c.eol_phase = 'DEPOT'`, vin).Scan(&n); err != nil {
			t.Fatal(err)
		}
		return n
	}
	const depotRows = `
		SELECT p.id FROM checklist_item_progress p JOIN checklist_template_items c ON c.id = p.check_item_id
		WHERE p.vin = ANY($1) AND p.checklist_type = 'EOL' AND c.eol_phase = 'DEPOT'`

	// New vehicles get every station step and checklist row as PENDING.
	for _, vin := range all {
		exec(`INSERT INTO vehicles (vin) VALUES ($1)`, vin)
	}
	exec(`UPDATE vehicle_station_step_progress SET status = 'OK' WHERE vin = ANY($1)`, all)
	exec(`UPDATE checklist_item_progress SET check_status = 'OK' WHERE vin = ANY($1) AND id NOT IN (`+depotRows+`)`, all)

	// Everything but the depot items: not 100%, exactly the depot items open.
	for _, vin := range all {
		s := check("all but depot", vin)
		if n := depotItems(vin); n == 0 || s.open != n || s.pct >= 100 {
			t.Fatalf("%s: want %d open depot item(s) and < 100%%, got open=%d progress=%.2f", vin, n, s.open, s.pct)
		}
	}

	exec(`UPDATE vehicle_eol_workflow SET branch_shipped_at = now() WHERE vin = ANY($1)`, []string{released, awaiting})
	if s := check("branch shipped", awaiting); s.pct >= 100 || s.open != depotItems(awaiting) {
		t.Errorf("branch shipped with depot items pending must stay below 100%%, got %.2f (open %d)", s.pct, s.open)
	}

	exec(`UPDATE checklist_item_progress SET check_status = 'OK' WHERE id IN (`+depotRows+`)`, []string{released})
	if s := check("depot items done", released); s.pct != 100 {
		t.Errorf("depot items done: want 100%%, got %.2f", s.pct)
	}
	exec(`UPDATE vehicle_eol_workflow SET depot_released_at = now() WHERE vin = $1`, released)
	before := map[string]snap{}
	for _, vin := range all {
		before[vin] = check("before new items", vin)
	}
	if before[released].pct != 100 {
		t.Fatalf("released: want 100%%, got %.2f", before[released].pct)
	}

	// New EOL depot item: counts for the vehicle awaiting release (and the one
	// on the line), not for the released one — also before distribution.
	eolTmpl := templateOf(ctx, t, tx, "eol_template_id")
	depot := domain.EOLItemPhaseDepot
	depotItem, err := checklists.CreateTemplateItem(ctx, &domain.ChecklistTemplateItem{TemplateID: eolTmpl, ItemText: "TMP_PROGRESS new depot item", EolPhase: &depot})
	if err != nil {
		t.Fatal(err)
	}
	for _, stage := range []string{"new depot item", "new depot item distributed"} {
		if stage == "new depot item distributed" {
			if _, err := checklists.InsertPendingForVehicles(ctx, depotItem.ID, eolTmpl, domain.ChecklistTypeEOL, domain.PropagationScopeIncomplete); err != nil {
				t.Fatal(err)
			}
		}
		for _, vin := range all {
			s := check(stage, vin)
			b := before[vin]
			wantExtra := 1
			if vin == released {
				wantExtra = 0
			}
			if s.applicable != b.applicable+wantExtra || s.open != b.open+wantExtra {
				t.Errorf("%s %s: applicable %d→%d open %d→%d, want +%d each", stage, vin, b.applicable, s.applicable, b.open, s.open, wantExtra)
			}
		}
	}
	if hasRow(ctx, t, tx, released, depotItem.ID) || !hasRow(ctx, t, tx, awaiting, depotItem.ID) {
		t.Error("depot item must reach the vehicle awaiting release and skip the released one")
	}
	for _, vin := range all {
		before[vin] = check("after depot item", vin)
	}

	// New TEST item: only the vehicle still on the line is affected.
	testTmpl := templateOf(ctx, t, tx, "test_template_id")
	testItem, err := checklists.CreateTemplateItem(ctx, &domain.ChecklistTemplateItem{TemplateID: testTmpl, ItemText: "TMP_PROGRESS new test item"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := checklists.InsertPendingForVehicles(ctx, testItem.ID, testTmpl, domain.ChecklistTypeTest, domain.PropagationScopeIncomplete); err != nil {
		t.Fatal(err)
	}
	for _, vin := range all {
		s := check("new test item", vin)
		b := before[vin]
		wantExtra := 0
		if vin == onLine {
			wantExtra = 1
		}
		if s.applicable != b.applicable+wantExtra || s.open != b.open+wantExtra {
			t.Errorf("test item %s: applicable %d→%d open %d→%d, want +%d each", vin, b.applicable, s.applicable, b.open, s.open, wantExtra)
		}
	}
	for _, vin := range all {
		before[vin] = check("after test item", vin)
	}

	// A SHIPMENT template with a pending item on every vehicle (Karar 33):
	// progress, applicable and open counts do not move, not even on the line.
	attachPendingShipmentTemplate(ctx, t, tx, all)
	for _, vin := range all {
		s := check("pending shipment template", vin)
		if b := before[vin]; s != b {
			t.Errorf("shipment item %s moved progress: %+v → %+v", vin, b, s)
		}
	}
}

// attachPendingShipmentTemplate gives the VINs a fresh SHIPMENT template with
// one active item and a PENDING progress row each, so retired shipment rows
// exist regardless of the seed.
func attachPendingShipmentTemplate(ctx context.Context, t *testing.T, tx pgx.Tx, vins []string) int {
	t.Helper()
	var tmpl, item int
	if err := tx.QueryRow(ctx,
		`INSERT INTO checklist_templates (type, name, is_active) VALUES ('SHIPMENT', 'TMP_SHIPMENT_RETIRED', false) RETURNING id`).Scan(&tmpl); err != nil {
		t.Fatal(err)
	}
	if err := tx.QueryRow(ctx,
		`INSERT INTO checklist_template_items (template_id, item_no, item_text) VALUES ($1, 1, 'TMP_SHIPMENT_RETIRED item') RETURNING id`, tmpl).Scan(&item); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `UPDATE vehicles SET shipment_template_id = $2 WHERE vin = ANY($1)`, vins, tmpl); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO checklist_item_progress (vin, checklist_type, check_item_id, check_status)
		SELECT vin, 'SHIPMENT', $2, 'PENDING' FROM vehicles WHERE vin = ANY($1)
		ON CONFLICT DO NOTHING`, vins, item); err != nil {
		t.Fatal(err)
	}
	return tmpl
}

// Every read path that returns the percentage (detail, list/print, VIN
// search) gives the same number for every vehicle.
func TestProgress_SameNumberOnEveryReadPath(t *testing.T) {
	ctx, tx := stageTestTx(t)
	repo := &VehicleRepo{}
	vehicles := loadStageVehicles(ctx, t, tx)
	for _, v := range vehicles {
		detail, err := repo.GetByVIN(ctx, v.vin)
		if err != nil {
			t.Fatal(err)
		}
		list, err := repo.List(ctx, domain.VehicleListFilter{VINContains: v.vin, Limit: 5})
		if err != nil {
			t.Fatal(err)
		}
		search, err := repo.SearchByVINSuffix(ctx, v.vin, 5)
		if err != nil {
			t.Fatal(err)
		}
		got := []float64{detail.TotalProgressPercentage}
		for _, rows := range [][]domain.Vehicle{list, search} {
			for _, r := range rows {
				if r.VIN == v.vin {
					got = append(got, r.TotalProgressPercentage)
				}
			}
		}
		wantPaths := 3
		if v.status == "PLANNED" {
			wantPaths = 2 // the vehicle list hides PLANNED
		}
		if len(got) != wantPaths {
			t.Fatalf("%s: found on %d read path(s), want %d", v.vin, len(got), wantPaths)
		}
		for _, g := range got[1:] {
			if g != got[0] {
				t.Errorf("%s: read paths disagree: %v", v.vin, got)
			}
		}
	}
	t.Logf("%d vehicles: detail = list = search", len(vehicles))
}

// No second, stored progress number exists in the schema: no column, view
// column or function body carries a progress percentage (migration 0032).
func TestSchema_NoStoredProgressPercentage(t *testing.T) {
	ctx, tx := stageTestTx(t)
	var columns, views, functions int
	if err := tx.QueryRow(ctx, `
		SELECT
		  (SELECT count(*)::int FROM information_schema.columns
		    WHERE table_schema = 'public' AND column_name ILIKE '%progress_percentage%'),
		  (SELECT count(*)::int FROM pg_views
		    WHERE schemaname = 'public' AND definition ILIKE '%progress_percentage%'),
		  (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
		    WHERE n.nspname = 'public' AND p.prosrc ILIKE '%progress_percentage%')`,
	).Scan(&columns, &views, &functions); err != nil {
		t.Fatal(err)
	}
	if columns+views+functions != 0 {
		t.Errorf("stored progress number found: columns=%d views=%d functions=%d", columns, views, functions)
	}
	var view bool
	if err := tx.QueryRow(ctx, `SELECT to_regclass('public.vw_vehicle_completion_split') IS NOT NULL`).Scan(&view); err != nil {
		t.Fatal(err)
	}
	if view {
		t.Error("vw_vehicle_completion_split must not exist")
	}
}
