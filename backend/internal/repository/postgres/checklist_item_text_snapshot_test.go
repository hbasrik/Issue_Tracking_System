package postgres

import (
	"testing"

	"github.com/karea/backend/internal/domain"
)

// TestSaveResult_ReCopiesItemTextOnEveryAnswer: when the template text
// changes between two answers, the second answer's copy carries the current
// text and the item list shows it; PENDING keeps the last copy. Rolled back.
func TestSaveResult_ReCopiesItemTextOnEveryAnswer(t *testing.T) {
	ctx, tx := stageTestTx(t)
	vin, itemID := tempCriteriaItem(ctx, t, tx, 9203, nil, nil, nil)
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
	snapshot := func() *string {
		t.Helper()
		var s *string
		if err := tx.QueryRow(ctx, `SELECT item_text_snapshot FROM checklist_item_progress
			WHERE vin = $1 AND check_item_id = $2`, vin, itemID).Scan(&s); err != nil {
			t.Fatal(err)
		}
		return s
	}
	shown := func() string {
		t.Helper()
		var tid int
		if err := tx.QueryRow(ctx, `SELECT template_id FROM checklist_template_items WHERE id = $1`, itemID).Scan(&tid); err != nil {
			t.Fatal(err)
		}
		items, err := repo.ListItemsWithProgress(ctx, vin, domain.ChecklistTypeEOL, tid)
		if err != nil {
			t.Fatal(err)
		}
		for _, it := range items {
			if it.ItemID == itemID {
				return it.ItemText
			}
		}
		t.Fatalf("item %d missing from the list", itemID)
		return ""
	}
	setText := func(text string) {
		t.Helper()
		if _, err := tx.Exec(ctx, `UPDATE checklist_template_items SET item_text = $2 WHERE id = $1`, itemID, text); err != nil {
			t.Fatal(err)
		}
	}
	show := func(p *string) string {
		if p == nil {
			return "<NULL>"
		}
		return *p
	}

	setText("tmp metin A")
	save(domain.CheckStatusOK, "")
	first := snapshot()
	if !eqp(first, strp("tmp metin A")) {
		t.Errorf("answer 1: snapshot %s, want tmp metin A", show(first))
	}

	setText("tmp metin B")
	if got := shown(); got != "tmp metin A" {
		t.Errorf("between answers the list must show the answered copy, got %q", got)
	}
	save(domain.CheckStatusNotOK, "contada yırtık")
	second := snapshot()
	if !eqp(second, strp("tmp metin B")) {
		t.Errorf("answer 2: snapshot %s, want tmp metin B", show(second))
	}
	if got := shown(); got != "tmp metin B" {
		t.Errorf("after answer 2 the list shows %q, want tmp metin B", got)
	}
	t.Logf("answer 1 (OK, template A):     snapshot=%s", show(first))
	t.Logf("answer 2 (NOT_OK, template B): snapshot=%s list=%s", show(second), shown())

	setText("tmp metin C")
	save(domain.CheckStatusPending, "")
	if p := snapshot(); !eqp(p, strp("tmp metin B")) {
		t.Errorf("PENDING must keep the last copy, got %s", show(p))
	}
	t.Logf("back to PENDING (template C):  snapshot=%s", show(snapshot()))
}
