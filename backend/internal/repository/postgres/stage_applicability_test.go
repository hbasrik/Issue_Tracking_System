package postgres

import (
	"context"
	"math"
	"net/url"
	"os"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/karea/backend/internal/domain"
)

// stageTestTx opens a transaction on TEST_DATABASE_URL (database name must
// end in _test: migrations + database/seed, with at least one vehicle on the
// line, one branch-shipped and one depot-released). Every write is rolled
// back.
func stageTestTx(t *testing.T) (context.Context, pgx.Tx) {
	t.Helper()
	raw := os.Getenv("TEST_DATABASE_URL")
	if raw == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	u, err := url.Parse(raw)
	if err != nil || !strings.HasSuffix(strings.TrimPrefix(u.Path, "/"), "_test") {
		t.Fatalf("TEST_DATABASE_URL must name a *_test database, got %q", raw)
	}
	pool, err := pgxpool.New(context.Background(), raw)
	if err != nil {
		t.Fatalf("pool: %v", err)
	}
	t.Cleanup(pool.Close)
	tx, err := pool.Begin(context.Background())
	if err != nil {
		t.Fatalf("begin: %v", err)
	}
	t.Cleanup(func() { _ = tx.Rollback(context.Background()) })
	return context.WithValue(context.Background(), txContextKey{}, tx), tx
}

type stageVehicle struct {
	vin, status                  string
	branchShipped, depotReleased bool
}

func loadStageVehicles(ctx context.Context, t *testing.T, tx pgx.Tx) []stageVehicle {
	t.Helper()
	rows, err := tx.Query(ctx, `
		SELECT v.vin, v.current_global_status::text,
		       w.branch_shipped_at IS NOT NULL, w.depot_released_at IS NOT NULL
		FROM vehicles v LEFT JOIN vehicle_eol_workflow w ON w.vin = v.vin
		ORDER BY v.vin`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var out []stageVehicle
	for rows.Next() {
		var v stageVehicle
		if err := rows.Scan(&v.vin, &v.status, &v.branchShipped, &v.depotReleased); err != nil {
			t.Fatal(err)
		}
		out = append(out, v)
	}
	return out
}

func (v stageVehicle) terminal() bool { return v.status == "DELIVERED" || v.status == "SHIPPED" }

func (v stageVehicle) passed(phase domain.EOLItemPhase) bool {
	if v.terminal() {
		return true
	}
	if phase == domain.EOLItemPhaseDepot {
		return v.depotReleased
	}
	return v.branchShipped
}

func hasRow(ctx context.Context, t *testing.T, tx pgx.Tx, vin string, itemID int) bool {
	t.Helper()
	var ok bool
	if err := tx.QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM checklist_item_progress WHERE vin = $1 AND check_item_id = $2)`,
		vin, itemID).Scan(&ok); err != nil {
		t.Fatal(err)
	}
	return ok
}

func templateOf(ctx context.Context, t *testing.T, tx pgx.Tx, col string) int {
	t.Helper()
	var id int
	if err := tx.QueryRow(ctx,
		`SELECT `+col+` FROM vehicles WHERE `+col+` IS NOT NULL GROUP BY 1 ORDER BY count(*) DESC LIMIT 1`).Scan(&id); err != nil {
		t.Fatal(err)
	}
	return id
}

// A new item reaches only vehicles that have not passed its stage: on line
// gets a test item, branch-shipped / depot-released / delivered do not;
// an EOL DEPOT item still reaches branch-shipped vehicles awaiting release.
func TestInsertPendingForVehicles_OnlyBeforeItemStage(t *testing.T) {
	ctx, tx := stageTestTx(t)
	repo := &ChecklistProgressRepo{}
	vehicles := loadStageVehicles(ctx, t, tx)

	cases := []struct {
		name  string
		typ   domain.ChecklistType
		col   string
		phase domain.EOLItemPhase
		// wantSome: a vehicle state that must receive the item.
		wantSome func(stageVehicle) bool
	}{
		{"test", domain.ChecklistTypeTest, "test_template_id", "",
			func(v stageVehicle) bool { return v.status == "IN_PRODUCTION" }},
		{"eol depot", domain.ChecklistTypeEOL, "eol_template_id", domain.EOLItemPhaseDepot,
			func(v stageVehicle) bool { return v.branchShipped && !v.depotReleased && !v.terminal() }},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			tmplID := templateOf(ctx, t, tx, tc.col)
			item := &domain.ChecklistTemplateItem{TemplateID: tmplID, ItemText: "TMP_STAGE_RULE " + tc.name}
			if tc.phase != "" {
				p := tc.phase
				item.EolPhase = &p
			}
			created, err := repo.CreateTemplateItem(ctx, item)
			if err != nil {
				t.Fatal(err)
			}
			if _, err := repo.InsertPendingForVehicles(ctx, created.ID, tmplID, tc.typ, domain.PropagationScopeIncomplete); err != nil {
				t.Fatal(err)
			}

			var assigned, gotSome, sawPassed int
			for _, v := range vehicles {
				var vt *int
				if err := tx.QueryRow(ctx, `SELECT `+tc.col+` FROM vehicles WHERE vin = $1`, v.vin).Scan(&vt); err != nil {
					t.Fatal(err)
				}
				if vt == nil || *vt != tmplID {
					continue
				}
				assigned++
				got := hasRow(ctx, t, tx, v.vin, created.ID)
				phase := tc.phase
				if tc.typ != domain.ChecklistTypeEOL {
					phase = domain.EOLItemPhaseBranch
				}
				if v.passed(phase) {
					sawPassed++
					if got {
						t.Errorf("%s (%s) passed the stage but received the item", v.vin, v.status)
					}
				}
				if got && tc.wantSome(v) {
					gotSome++
				}
			}
			if assigned == 0 || sawPassed == 0 || gotSome == 0 {
				t.Fatalf("fixture too thin: assigned=%d passed=%d eligible-received=%d", assigned, sawPassed, gotSome)
			}

			// Missing = should have it but does not; passed vehicles never count.
			_, missing, err := repo.ListVehiclesMissingTemplateItem(ctx, tmplID, created.ID, tc.typ, 500)
			if err != nil {
				t.Fatal(err)
			}
			nsA, nsP, incA, incP, err := repo.CreateImpact(ctx, tmplID, tc.typ, item.EolPhase)
			if err != nil {
				t.Fatal(err)
			}
			if nsA+nsP != assigned || incA+incP != assigned {
				t.Errorf("impact buckets must cover every assigned vehicle: ns=%d+%d inc=%d+%d assigned=%d",
					nsA, nsP, incA, incP, assigned)
			}
			if incA > assigned-sawPassed || nsA > assigned-sawPassed {
				t.Errorf("impact counts vehicles past the stage as affected: ns=%d inc=%d eligible=%d",
					nsA, incA, assigned-sawPassed)
			}
			t.Logf("assigned=%d passed=%d eligible-received=%d still-missing=%d", assigned, sawPassed, gotSome, missing)
		})
	}
}

// addDeliveredVehicle builds a delivered vehicle inside the test transaction:
// a new vehicle (triggers create its PENDING rows), every step and checklist
// row OK, then branch ship → depot release → deliver through the workflow repo.
func addDeliveredVehicle(ctx context.Context, t *testing.T, tx pgx.Tx, vin string) {
	t.Helper()
	for _, sql := range []string{
		`INSERT INTO vehicles (vin) VALUES ($1)`,
		`UPDATE vehicle_station_step_progress SET status = 'OK' WHERE vin = $1`,
		`UPDATE checklist_item_progress SET check_status = 'OK' WHERE vin = $1`,
	} {
		if _, err := tx.Exec(ctx, sql, vin); err != nil {
			t.Fatalf("%s: %v", sql, err)
		}
	}
	var actor int
	if err := tx.QueryRow(ctx, `SELECT id FROM users ORDER BY id LIMIT 1`).Scan(&actor); err != nil {
		t.Fatal(err)
	}
	workflow := &EOLWorkflowRepo{}
	if err := workflow.MarkBranchShipped(ctx, vin, actor, 0); err != nil {
		t.Fatalf("branch ship %s: %v", vin, err)
	}
	if err := workflow.MarkDepotReleased(ctx, vin, actor); err != nil {
		t.Fatalf("depot release %s: %v", vin, err)
	}
	if err := workflow.MarkDelivered(ctx, vin, actor); err != nil {
		t.Fatalf("deliver %s: %v", vin, err)
	}
}

// Progress % and the warning list come from one set: for every vehicle,
// percentage == passing/applicable and 100% exactly when nothing is open.
// A wrongly distributed PENDING row on a passed stage (migration 0023 style)
// is neither listed nor counted.
func TestApplicableSet_ProgressMatchesOpenItems(t *testing.T) {
	ctx, tx := stageTestTx(t)
	checklists := &ChecklistProgressRepo{}
	steps := &StationStepProgressRepo{}
	vehiclesRepo := &VehicleRepo{}
	addDeliveredVehicle(ctx, t, tx, "TMPDELIVER0000001")
	vehicles := loadStageVehicles(ctx, t, tx)

	testTmpl := templateOf(ctx, t, tx, "test_template_id")
	stray, err := checklists.CreateTemplateItem(ctx, &domain.ChecklistTemplateItem{TemplateID: testTmpl, ItemText: "TMP_STAGE_RULE stray"})
	if err != nil {
		t.Fatal(err)
	}
	var strayVINs, allVINs []string
	for _, v := range vehicles {
		allVINs = append(allVINs, v.vin)
		if v.branchShipped || v.terminal() {
			strayVINs = append(strayVINs, v.vin)
			if _, err := tx.Exec(ctx,
				`INSERT INTO checklist_item_progress (vin, checklist_type, check_item_id, check_status)
				 SELECT vin, 'TEST', $2, 'PENDING' FROM vehicles WHERE vin = $1 AND test_template_id = $3`,
				v.vin, stray.ID, testTmpl); err != nil {
				t.Fatal(err)
			}
		}
	}
	if len(strayVINs) == 0 {
		t.Fatal("fixture needs branch-shipped or delivered vehicles")
	}
	attachPendingShipmentTemplate(ctx, t, tx, allVINs)

	var sawDelivered bool
	for _, v := range vehicles {
		veh, err := vehiclesRepo.GetByVIN(ctx, v.vin)
		if err != nil {
			t.Fatal(err)
		}
		open, err := steps.CountApplicableOpen(ctx, v.vin)
		if err != nil {
			t.Fatal(err)
		}
		var applicable int
		if err := tx.QueryRow(ctx, `SELECT
			(SELECT count(*) FROM (`+applicableStationStepsSQL("$1")+`) s) +
			(SELECT count(*) FROM (`+applicableChecklistItemsSQL("$1")+`) c)`, v.vin).Scan(&applicable); err != nil {
			t.Fatal(err)
		}
		shipment, err := checklists.ListApplicableItems(ctx, v.vin, domain.ChecklistTypeShipment)
		if err != nil {
			t.Fatal(err)
		}
		if len(shipment) != 0 {
			t.Errorf("%s (%s): %d SHIPMENT item(s) applicable, want none (Karar 33)", v.vin, v.status, len(shipment))
		}
		for _, typ := range []domain.ChecklistType{domain.ChecklistTypeTest, domain.ChecklistTypeEOL} {
			items, err := checklists.ListApplicableItems(ctx, v.vin, typ)
			if err != nil {
				t.Fatal(err)
			}
			for _, it := range items {
				if it.ItemID == stray.ID && v.passed(domain.EOLItemPhaseBranch) {
					t.Errorf("%s (%s): stray PENDING on a passed stage is listed", v.vin, v.status)
				}
				if !it.Status.IsPassing() {
					open++
				}
			}
		}
		want := 0.0
		if applicable > 0 {
			want = math.Round(10000*float64(applicable-open)/float64(applicable)) / 100
		}
		if math.Abs(veh.TotalProgressPercentage-want) > 0.005 {
			t.Errorf("%s (%s): progress %.2f, open %d of %d → want %.2f",
				v.vin, v.status, veh.TotalProgressPercentage, open, applicable, want)
		}
		if (veh.TotalProgressPercentage == 100) != (open == 0 && applicable > 0) {
			t.Errorf("%s (%s): progress %.2f contradicts %d open item(s)", v.vin, v.status, veh.TotalProgressPercentage, open)
		}
		if v.terminal() {
			sawDelivered = true
			if open != 0 || veh.TotalProgressPercentage != 100 {
				t.Errorf("delivered %s: want 100%% and nothing open, got %.2f / %d", v.vin, veh.TotalProgressPercentage, open)
			}
		}
		t.Logf("%s %-13s progress=%6.2f open=%d applicable=%d", v.vin, v.status, veh.TotalProgressPercentage, open, applicable)
	}
	if !sawDelivered {
		t.Fatal("fixture needs a delivered vehicle")
	}
}

// The checklist tab marks StageClosed exactly on the active items outside
// the applicable set: every other active item is applicable, a line vehicle
// has none closed, and a passed vehicle's never-evaluated item is closed.
func TestListItemsWithProgress_StageClosedIsApplicableComplement(t *testing.T) {
	ctx, tx := stageTestTx(t)
	repo := &ChecklistProgressRepo{}
	vehicles := loadStageVehicles(ctx, t, tx)

	testTmpl := templateOf(ctx, t, tx, "test_template_id")
	late, err := repo.CreateTemplateItem(ctx, &domain.ChecklistTemplateItem{TemplateID: testTmpl, ItemText: "TMP_STAGE_RULE late"})
	if err != nil {
		t.Fatal(err)
	}

	cols := map[domain.ChecklistType]string{
		domain.ChecklistTypeTest: "test_template_id",
		domain.ChecklistTypeEOL:  "eol_template_id",
	}
	var closedOnPassed, lineChecked int
	for _, v := range vehicles {
		for typ, col := range cols {
			var tmpl *int
			if err := tx.QueryRow(ctx, `SELECT `+col+` FROM vehicles WHERE vin = $1`, v.vin).Scan(&tmpl); err != nil {
				t.Fatal(err)
			}
			if tmpl == nil {
				continue
			}
			all, err := repo.ListItemsWithProgress(ctx, v.vin, typ, *tmpl)
			if err != nil {
				t.Fatal(err)
			}
			applicable, err := repo.ListApplicableItems(ctx, v.vin, typ)
			if err != nil {
				t.Fatal(err)
			}
			inApplicable := map[int]bool{}
			for _, it := range applicable {
				inApplicable[it.ItemID] = true
			}
			open := 0
			for _, it := range all {
				if !it.IsActive {
					if it.StageClosed {
						t.Errorf("%s item %d: inactive rows are never StageClosed", v.vin, it.ItemID)
					}
					continue
				}
				if it.StageClosed == inApplicable[it.ItemID] {
					t.Errorf("%s (%s) %s item %d: StageClosed=%v but applicable=%v",
						v.vin, v.status, typ, it.ItemID, it.StageClosed, inApplicable[it.ItemID])
				}
				if it.StageClosed && v.passed(domain.EOLItemPhaseBranch) {
					closedOnPassed++
				}
				if !v.passed(domain.EOLItemPhaseBranch) && it.StageClosed {
					t.Errorf("line vehicle %s: item %d must not be closed", v.vin, it.ItemID)
				}
				if !it.StageClosed && !it.Status.IsPassing() {
					open++
				}
			}
			if !v.passed(domain.EOLItemPhaseBranch) {
				lineChecked++
			}
			// Gate / counters ignore closed items: the Go gate sees only open ones.
			_, blocking, missing := evaluateGate(all)
			if blocking+missing != open {
				t.Errorf("%s %s: gate counts %d, open applicable %d", v.vin, typ, blocking+missing, open)
			}
			if typ == domain.ChecklistTypeTest && v.passed(domain.EOLItemPhaseBranch) {
				for _, it := range all {
					if it.ItemID == late.ID && !it.StageClosed {
						t.Errorf("%s (%s): late item on a passed stage is not closed", v.vin, v.status)
					}
				}
			}
		}
	}
	if closedOnPassed == 0 || lineChecked == 0 {
		t.Fatalf("fixture too thin: closedOnPassed=%d lineChecked=%d", closedOnPassed, lineChecked)
	}
}

// evaluateGate mirrors usecase.EvaluateChecklistGate (not importable here).
func evaluateGate(items []domain.ChecklistItemView) (open bool, blocking, missing int) {
	for _, it := range items {
		if !it.IsActive || it.StageClosed {
			continue
		}
		if it.ProgressID == nil {
			missing++
		} else if !it.Status.IsPassing() {
			blocking++
		}
	}
	return blocking == 0 && missing == 0, blocking, missing
}

// Migration 0031: a never-evaluated branch row after branch ship does not
// lock depot edits; on a vehicle still on the line a pending branch row does.
func TestDepotSequencingTrigger_IgnoresClosedBranchRows(t *testing.T) {
	ctx, tx := stageTestTx(t)
	repo := &ChecklistProgressRepo{}

	var shipped, line string
	var eolTmpl int
	if err := tx.QueryRow(ctx, `
		SELECT v.vin, v.eol_template_id FROM vehicles v JOIN vehicle_eol_workflow w ON w.vin = v.vin
		WHERE w.branch_shipped_at IS NOT NULL AND v.current_global_status NOT IN ('DELIVERED','SHIPPED')
		  AND EXISTS (SELECT 1 FROM checklist_item_progress p JOIN checklist_template_items c ON c.id = p.check_item_id
		              WHERE p.vin = v.vin AND c.eol_phase = 'DEPOT')
		  AND NOT EXISTS (SELECT 1 FROM checklist_item_progress p JOIN checklist_template_items c ON c.id = p.check_item_id
		              WHERE p.vin = v.vin AND c.eol_phase = 'BRANCH'
		                AND p.check_status NOT IN ('OK','CONDITIONAL_OK','PENDING'))
		ORDER BY v.vin LIMIT 1`).Scan(&shipped, &eolTmpl); err != nil {
		t.Fatalf("fixture needs a branch-shipped vehicle with depot rows: %v", err)
	}
	if err := tx.QueryRow(ctx, `
		SELECT v.vin FROM vehicles v LEFT JOIN vehicle_eol_workflow w ON w.vin = v.vin
		WHERE w.branch_shipped_at IS NULL AND v.eol_template_id = $1
		  AND EXISTS (SELECT 1 FROM checklist_item_progress p JOIN checklist_template_items c ON c.id = p.check_item_id
		              WHERE p.vin = v.vin AND c.eol_phase = 'DEPOT')
		ORDER BY v.vin LIMIT 1`, eolTmpl).Scan(&line); err != nil {
		t.Fatalf("fixture needs a line vehicle with depot rows: %v", err)
	}

	branch := domain.EOLItemPhaseBranch
	late, err := repo.CreateTemplateItem(ctx, &domain.ChecklistTemplateItem{TemplateID: eolTmpl, ItemText: "TMP_STAGE_RULE late branch", EolPhase: &branch})
	if err != nil {
		t.Fatal(err)
	}
	for _, vin := range []string{shipped, line} {
		if _, err := tx.Exec(ctx,
			`INSERT INTO checklist_item_progress (vin, checklist_type, check_item_id, check_status) VALUES ($1, 'EOL', $2, 'PENDING')`,
			vin, late.ID); err != nil {
			t.Fatal(err)
		}
	}

	touchDepot := func(vin string) error {
		sp, err := tx.Begin(ctx)
		if err != nil {
			t.Fatal(err)
		}
		defer func() { _ = sp.Rollback(ctx) }()
		_, err = sp.Exec(ctx, `
			UPDATE checklist_item_progress p SET check_status = 'OK', rejected_desc = NULL, rework_desc = NULL, conditional_desc = NULL
			WHERE p.id = (SELECT p2.id FROM checklist_item_progress p2 JOIN checklist_template_items c ON c.id = p2.check_item_id
			              WHERE p2.vin = $1 AND c.eol_phase = 'DEPOT' ORDER BY p2.id LIMIT 1)`, vin)
		return err
	}
	if err := touchDepot(shipped); err != nil {
		t.Errorf("branch-shipped %s: closed branch row blocked a depot edit: %v", shipped, err)
	}
	if err := touchDepot(line); err == nil {
		t.Errorf("line vehicle %s: pending branch row must still block depot edits", line)
	}
}
