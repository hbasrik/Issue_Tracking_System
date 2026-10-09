package usecase_test

import (
	"context"
	"testing"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/usecase"
)

// TestRecordChecklistAudit_KeepsOldAndNewEOLNote walks one EoL item through
// four answers and checks each CHECKLIST_ITEM_UPDATE row carries the replaced
// note as old_note and the new one as new_note, omitting a key (never "")
// when that note is empty.
func TestRecordChecklistAudit_KeepsOldAndNewEOLNote(t *testing.T) {
	const vin = "1HGCM82633A004352"
	checklist := newFakeChecklistRepo()
	checklist.rows[vin] = []domain.ChecklistProgress{
		{VIN: vin, ChecklistType: domain.ChecklistTypeEOL, CheckItemID: 1, CheckStatus: domain.CheckStatusPending},
	}
	vehicles := newFakeVehicleRepo()
	vehicles.vehicles[vin] = &domain.Vehicle{VIN: vin, CurrentGlobalStatus: domain.VehicleStatusInProduction}
	audit := &fakeAuditRepo{}
	rec := usecase.NewChecklistResultRecorder(vehicles, checklist, audit, nil)

	steps := []struct {
		status  domain.CheckStatus
		note    string
		oldNote any
		newNote any
	}{
		{domain.CheckStatusOK, "ölçüm 12.6", nil, "ölçüm 12.6"},
		{domain.CheckStatusNotOK, "conta yırtık", "ölçüm 12.6", "conta yırtık"},
		{domain.CheckStatusOK, "", "conta yırtık", nil},
		{domain.CheckStatusConditionalOK, "paspas sonra", nil, "paspas sonra"},
	}
	for i, s := range steps {
		_, err := rec.Record(context.Background(), usecase.RecordChecklistInput{
			VIN: vin, ChecklistType: domain.ChecklistTypeEOL, ItemID: 1,
			Status: s.status, CheckerID: 7, Note: s.note,
		})
		if err != nil {
			t.Fatalf("step %d: %v", i+1, err)
		}
		entry := audit.entries[len(audit.entries)-1]
		md := entry.Metadata
		oldNote, hasOld := md["old_note"]
		newNote, hasNew := md["new_note"]
		if (s.oldNote == nil) == hasOld || (hasOld && oldNote != s.oldNote) {
			t.Errorf("step %d old_note = %v (present %v), want %v", i+1, oldNote, hasOld, s.oldNote)
		}
		if (s.newNote == nil) == hasNew || (hasNew && newNote != s.newNote) {
			t.Errorf("step %d new_note = %v (present %v), want %v", i+1, newNote, hasNew, s.newNote)
		}
		for k := range md {
			switch k {
			case "item_id", "checklist_type", "old_note", "new_note":
			default:
				t.Errorf("step %d: unexpected metadata key %q", i+1, k)
			}
		}
		t.Logf("step %d %s -> %s metadata %v", i+1, entry.OldValue, entry.NewValue, md)
	}
}

func TestRecordChecklistAudit_NoNoteKeysOutsideEOL(t *testing.T) {
	const vin = "1HGCM82633A004352"
	checklist := newFakeChecklistRepo()
	checklist.rows[vin] = []domain.ChecklistProgress{
		{VIN: vin, ChecklistType: domain.ChecklistTypeTest, CheckItemID: 1, CheckStatus: domain.CheckStatusPending},
	}
	vehicles := newFakeVehicleRepo()
	vehicles.vehicles[vin] = &domain.Vehicle{VIN: vin, CurrentGlobalStatus: domain.VehicleStatusInWarehouse}
	audit := &fakeAuditRepo{}
	rec := usecase.NewChecklistResultRecorder(vehicles, checklist, audit, nil)
	if _, err := rec.Record(context.Background(), usecase.RecordChecklistInput{
		VIN: vin, ChecklistType: domain.ChecklistTypeTest, ItemID: 1,
		Status: domain.CheckStatusOK, CheckerID: 7, Note: "torque ok",
	}); err != nil {
		t.Fatal(err)
	}
	md := audit.entries[0].Metadata
	if _, ok := md["new_note"]; ok {
		t.Errorf("test metadata %v carries new_note", md)
	}
}
