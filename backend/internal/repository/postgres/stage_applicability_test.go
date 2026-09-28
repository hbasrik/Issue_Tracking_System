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
// line, one branch-shipped, one depot-released and one delivered). Every
// write is rolled back.
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
// gets a shipment item, branch-shipped / depot-released / delivered do not;
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
		{"shipment", domain.ChecklistTypeShipment, "shipment_template_id", "",
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

// Progress % and the warning list come from one set: for every vehicle,
// percentage == passing/applicable and 100% exactly when nothing is open.
// A wrongly distributed PENDING row on a passed stage (migration 0023 style)
// is neither listed nor counted.
func TestApplicableSet_ProgressMatchesOpenItems(t *testing.T) {
	ctx, tx := stageTestTx(t)
	checklists := &ChecklistProgressRepo{}
	steps := &StationStepProgressRepo{}
	vehiclesRepo := &VehicleRepo{}
	vehicles := loadStageVehicles(ctx, t, tx)

	shipTmpl := templateOf(ctx, t, tx, "shipment_template_id")
	stray, err := checklists.CreateTemplateItem(ctx, &domain.ChecklistTemplateItem{TemplateID: shipTmpl, ItemText: "TMP_STAGE_RULE stray"})
	if err != nil {
		t.Fatal(err)
	}
	var strayVINs []string
	for _, v := range vehicles {
		if v.branchShipped || v.terminal() {
			strayVINs = append(strayVINs, v.vin)
			if _, err := tx.Exec(ctx,
				`INSERT INTO checklist_item_progress (vin, checklist_type, check_item_id, check_status)
				 SELECT vin, 'SHIPMENT', $2, 'PENDING' FROM vehicles WHERE vin = $1 AND shipment_template_id = $3`,
				v.vin, stray.ID, shipTmpl); err != nil {
				t.Fatal(err)
			}
		}
	}
	if len(strayVINs) == 0 {
		t.Fatal("fixture needs branch-shipped or delivered vehicles")
	}

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
		for _, typ := range []domain.ChecklistType{domain.ChecklistTypeShipment, domain.ChecklistTypeTest, domain.ChecklistTypeEOL} {
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
