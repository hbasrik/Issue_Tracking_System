package postgres

import (
	"context"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"

	"github.com/karea/backend/internal/domain"
)

type criteriaCopy struct {
	criterion, method, revision *string
	stamped                     bool
}

func (c criteriaCopy) String() string {
	s := func(p *string) string {
		if p == nil {
			return "<NULL>"
		}
		return *p
	}
	return "criterion=" + s(c.criterion) + " method=" + s(c.method) + " revision=" + s(c.revision) +
		map[bool]string{true: " stamped", false: " unstamped"}[c.stamped]
}

func readCriteriaCopy(ctx context.Context, t *testing.T, tx pgx.Tx, vin string, itemID int) criteriaCopy {
	t.Helper()
	var c criteriaCopy
	if err := tx.QueryRow(ctx, `
		SELECT acceptance_criterion_snapshot, control_method_snapshot, form_revision_snapshot,
		       criteria_snapshot_at IS NOT NULL
		FROM checklist_item_progress WHERE vin = $1 AND check_item_id = $2`,
		vin, itemID).Scan(&c.criterion, &c.method, &c.revision, &c.stamped); err != nil {
		t.Fatal(err)
	}
	return c
}

// tempCriteriaItem adds a marked EoL Branch item with a PENDING row on an
// open Branch-stage vehicle, so the template can change between answers
// without touching seeded items. Rolled back with the test transaction.
func tempCriteriaItem(ctx context.Context, t *testing.T, tx pgx.Tx, itemNo int, criterion, method, revision *string) (string, int) {
	t.Helper()
	var vin string
	var itemID int
	if err := tx.QueryRow(ctx, `
		WITH v AS (
		  SELECT w.vin, veh.eol_template_id
		  FROM vehicle_eol_workflow w JOIN vehicles veh ON veh.vin = w.vin
		  WHERE w.current_stage = 'BRANCH' AND w.branch_shipped_at IS NULL
		  ORDER BY w.vin LIMIT 1
		), item AS (
		  INSERT INTO checklist_template_items (template_id, item_no, item_text, eol_phase, is_active,
		                                        acceptance_criterion, control_method, form_revision)
		  SELECT eol_template_id, $1::smallint, 'tmp-criteria-snapshot ' || $1::text, 'BRANCH', true,
		         $2::text, $3::text, $4::text FROM v
		  RETURNING id
		)
		INSERT INTO checklist_item_progress (vin, checklist_type, check_item_id, check_status)
		SELECT v.vin, 'EOL', item.id, 'PENDING' FROM v, item
		RETURNING vin, check_item_id`, itemNo, criterion, method, revision).Scan(&vin, &itemID); err != nil {
		t.Fatalf("temp item: %v", err)
	}
	return vin, itemID
}

func strp(s string) *string { return &s }

func eqp(a, b *string) bool { return (a == nil && b == nil) || (a != nil && b != nil && *a == *b) }

// TestSaveResult_CopiesCriteriaOnEveryAnswer: the first answer copies the
// template's criterion, method and revision with a stamp; after the
// template changes the next answer carries the new values; PENDING keeps the
// copy. Rolled back.
func TestSaveResult_CopiesCriteriaOnEveryAnswer(t *testing.T) {
	ctx, tx := stageTestTx(t)
	vin, itemID := tempCriteriaItem(ctx, t, tx, 9201, strp("Boşluk 3–5 mm"), strp("Görsel"), strp("Rev. 02"))
	repo := NewChecklistProgressRepo(nil)
	save := func(status domain.CheckStatus, note string) {
		t.Helper()
		n := domain.NotesForStatus(status, note)
		if err := repo.SaveResult(ctx, domain.ChecklistProgress{
			VIN: vin, ChecklistType: domain.ChecklistTypeEOL, CheckItemID: itemID,
			CheckStatus: status, CheckerID: ptrInt(1),
			ReworkDesc: n.Rework, ConditionalDesc: n.Conditional, RejectedDesc: n.Rejected, ApprovedDesc: n.Approved,
		}); err != nil {
			t.Fatalf("save %s: %v", status, err)
		}
	}

	before := readCriteriaCopy(ctx, t, tx, vin, itemID)
	if before.criterion != nil || before.method != nil || before.revision != nil || before.stamped {
		t.Fatalf("PENDING row must start without a copy, got %s", before)
	}

	save(domain.CheckStatusOK, "")
	first := readCriteriaCopy(ctx, t, tx, vin, itemID)
	if !eqp(first.criterion, strp("Boşluk 3–5 mm")) || !eqp(first.method, strp("Görsel")) ||
		!eqp(first.revision, strp("Rev. 02")) || !first.stamped {
		t.Errorf("first answer: got %s", first)
	}

	if _, err := tx.Exec(ctx, `UPDATE checklist_template_items
		SET acceptance_criterion = 'Boşluk 2–4 mm', control_method = 'Kumpas', form_revision = 'Rev. 03'
		WHERE id = $1`, itemID); err != nil {
		t.Fatal(err)
	}
	save(domain.CheckStatusNotOK, "boşluk 6 mm")
	second := readCriteriaCopy(ctx, t, tx, vin, itemID)
	if !eqp(second.criterion, strp("Boşluk 2–4 mm")) || !eqp(second.method, strp("Kumpas")) ||
		!eqp(second.revision, strp("Rev. 03")) || !second.stamped {
		t.Errorf("second answer after template change: got %s", second)
	}
	t.Logf("answer 1 (OK):     %s", first)
	t.Logf("answer 2 (NOT_OK): %s", second)

	save(domain.CheckStatusPending, "")
	pending := readCriteriaCopy(ctx, t, tx, vin, itemID)
	if !eqp(pending.criterion, second.criterion) || !eqp(pending.method, second.method) ||
		!eqp(pending.revision, second.revision) || !pending.stamped {
		t.Errorf("PENDING must keep the copy, got %s", pending)
	}
	t.Logf("back to PENDING:   %s", pending)
}

// TestSaveResult_NoCriteriaStampsNullCopy: an item whose form gives no
// criterion (NULL or blank) gets a stamp and NULL copies. Rolled back.
func TestSaveResult_NoCriteriaStampsNullCopy(t *testing.T) {
	ctx, tx := stageTestTx(t)
	vin, itemID := tempCriteriaItem(ctx, t, tx, 9202, nil, strp("   "), nil)
	if err := NewChecklistProgressRepo(nil).SaveResult(ctx, domain.ChecklistProgress{
		VIN: vin, ChecklistType: domain.ChecklistTypeEOL, CheckItemID: itemID,
		CheckStatus: domain.CheckStatusOK, CheckerID: ptrInt(1),
	}); err != nil {
		t.Fatal(err)
	}
	got := readCriteriaCopy(ctx, t, tx, vin, itemID)
	if got.criterion != nil || got.method != nil || got.revision != nil || !got.stamped {
		t.Errorf("no criteria: want stamped NULL copy, got %s", got)
	}
	t.Logf("no criteria: %s", got)
}

// TestChecklistFrozen_SnapshotColumnsRefusedBySQL: on a frozen row a direct
// UPDATE of any copy column is refused by the 0042 trigger and the row md5
// stays the same. Rolled back.
func TestChecklistFrozen_SnapshotColumnsRefusedBySQL(t *testing.T) {
	ctx, tx := stageTestTx(t)
	deliverOne(ctx, t, tx)
	for reason, sentinel := range map[string]error{
		"BRANCH_SHIPPED": domain.ErrChecklistFrozenBranchShipped,
		"DEPOT_RELEASED": domain.ErrChecklistFrozenDepotReleased,
		"DELIVERED":      domain.ErrChecklistFrozenDelivered,
	} {
		row, ok := findFrozenRow(ctx, t, tx, reason, domain.ChecklistTypeEOL)
		if !ok {
			t.Fatalf("no frozen EOL row for %s", reason)
		}
		before := rowMD5(ctx, t, tx, row.id)
		for _, set := range []string{
			"acceptance_criterion_snapshot = 'x', criteria_snapshot_at = now()",
			"control_method_snapshot = 'x', criteria_snapshot_at = now()",
			"form_revision_snapshot = 'x', criteria_snapshot_at = now()",
			"criteria_snapshot_at = now()",
		} {
			err := inSavepoint(ctx, t, tx, func(ctx context.Context) error {
				_, err := executor(ctx, nil).Exec(ctx, `UPDATE checklist_item_progress SET `+set+` WHERE id = $1`, row.id)
				return err
			})
			if err == nil || !strings.Contains(err.Error(), sentinel.Error()) {
				t.Errorf("%s progress %d SET %s: err = %v", reason, row.id, set, err)
			}
		}
		if after := rowMD5(ctx, t, tx, row.id); after != before {
			t.Errorf("%s progress %d: md5 %s -> %s", reason, row.id, before, after)
		}
		t.Logf("%s progress %d: 4 copy-column UPDATEs refused, md5 %s unchanged", reason, row.id, before)
	}
}
