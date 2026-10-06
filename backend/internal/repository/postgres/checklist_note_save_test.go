package postgres

import (
	"testing"

	"github.com/karea/backend/internal/domain"
)

// TestSaveResult_NoteTransitionsKeepOneColumn walks one EoL row through
// OK → NOT_OK → OK (no note) → CONDITIONAL_OK and checks after every save
// that only the column owned by the answer is set. A column missing from the
// SaveResult UPDATE would leave an older note behind. Rolled back.
func TestSaveResult_NoteTransitionsKeepOneColumn(t *testing.T) {
	ctx, tx := stageTestTx(t)

	var vin string
	var itemID, checkerID int
	err := tx.QueryRow(ctx, `
		SELECT p.vin, p.check_item_id, (SELECT min(id) FROM users)
		FROM checklist_item_progress p
		JOIN checklist_template_items cti ON cti.id = p.check_item_id
		JOIN vehicle_eol_workflow w ON w.vin = p.vin
		WHERE p.checklist_type = 'EOL' AND cti.eol_phase = 'BRANCH'
		  AND w.current_stage = 'BRANCH'
		ORDER BY p.vin, cti.item_no LIMIT 1`).Scan(&vin, &itemID, &checkerID)
	if err != nil {
		t.Fatalf("no EoL Branch row on a Branch-stage vehicle: %v", err)
	}

	repo := NewChecklistProgressRepo(nil)
	steps := []struct {
		status domain.CheckStatus
		note   string
		want   [4]string // approved, conditional, rejected, rework
	}{
		{domain.CheckStatusOK, "ölçüm 12.6", [4]string{"ölçüm 12.6", "", "", ""}},
		{domain.CheckStatusNotOK, "conta yırtık", [4]string{"", "", "conta yırtık", ""}},
		{domain.CheckStatusOK, "", [4]string{"", "", "", ""}},
		{domain.CheckStatusConditionalOK, "paspas sonra", [4]string{"", "paspas sonra", "", ""}},
	}
	for i, s := range steps {
		n := domain.NotesForStatus(s.status, s.note)
		err := repo.SaveResult(ctx, domain.ChecklistProgress{
			VIN: vin, ChecklistType: domain.ChecklistTypeEOL, CheckItemID: itemID,
			CheckStatus: s.status, CheckerID: &checkerID,
			ReworkDesc: n.Rework, ConditionalDesc: n.Conditional,
			RejectedDesc: n.Rejected, ApprovedDesc: n.Approved,
		})
		if err != nil {
			t.Fatalf("step %d %s: %v", i+1, s.status, err)
		}
		var got [4]*string
		if err := tx.QueryRow(ctx, `
			SELECT approved_desc, conditional_desc, rejected_desc, rework_desc
			FROM checklist_item_progress
			WHERE vin = $1 AND check_item_id = $2 AND checklist_type = 'EOL'`,
			vin, itemID).Scan(&got[0], &got[1], &got[2], &got[3]); err != nil {
			t.Fatal(err)
		}
		shown := [4]string{}
		for c := range got {
			if got[c] == nil {
				shown[c] = "<NULL>"
				if s.want[c] != "" {
					t.Errorf("step %d %s: column %d is NULL, want %q", i+1, s.status, c, s.want[c])
				}
				continue
			}
			shown[c] = *got[c]
			if *got[c] != s.want[c] || s.want[c] == "" {
				t.Errorf("step %d %s: column %d = %q, want %q", i+1, s.status, c, *got[c], s.want[c])
			}
		}
		t.Logf("step %d %-14s approved=%s conditional=%s rejected=%s rework=%s",
			i+1, s.status, shown[0], shown[1], shown[2], shown[3])
	}
}
