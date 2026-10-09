package usecase_test

import (
	"context"
	"errors"
	"testing"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/usecase"
)

// recordNote records one item. EoL validation runs before the repo is touched;
// storage is exercised on Test so the fake needs no EoL depot fixture.
func recordNote(t *testing.T, ct domain.ChecklistType, in usecase.RecordChecklistInput) (domain.ChecklistProgress, error) {
	t.Helper()
	const vin = "1HGCM82633A004352"
	checklist := newFakeChecklistRepo()
	checklist.rows[vin] = []domain.ChecklistProgress{
		{VIN: vin, ChecklistType: ct, CheckItemID: 1, CheckStatus: domain.CheckStatusPending},
	}
	vehicles := newFakeVehicleRepo()
	vehicles.vehicles[vin] = &domain.Vehicle{VIN: vin, CurrentGlobalStatus: domain.VehicleStatusInWarehouse}
	rec := usecase.NewChecklistResultRecorder(vehicles, checklist, nil, nil)
	in.VIN = vin
	in.ChecklistType = ct
	in.ItemID = 1
	in.CheckerID = 7
	_, err := rec.Record(context.Background(), in)
	return checklist.rows[vin][0], err
}

func TestRecordChecklistNote_StoredInColumnOwnedByAnswer(t *testing.T) {
	cases := []struct {
		status domain.CheckStatus
		want   domain.ChecklistNotes
	}{
		{domain.CheckStatusOK, domain.ChecklistNotes{Approved: "12.4 V"}},
		{domain.CheckStatusConditionalOK, domain.ChecklistNotes{Conditional: "12.4 V"}},
		{domain.CheckStatusNotOK, domain.ChecklistNotes{Rejected: "12.4 V"}},
		{domain.CheckStatusRework, domain.ChecklistNotes{Rework: "12.4 V"}},
	}
	for _, tc := range cases {
		row, err := recordNote(t, domain.ChecklistTypeTest, usecase.RecordChecklistInput{Status: tc.status, Note: "  12.4 V "})
		if err != nil {
			t.Fatalf("%s: %v", tc.status, err)
		}
		got := domain.ChecklistNotes{
			Rework: row.ReworkDesc, Conditional: row.ConditionalDesc,
			Rejected: row.RejectedDesc, Approved: row.ApprovedDesc,
		}
		if got != tc.want {
			t.Errorf("%s: got %+v, want %+v", tc.status, got, tc.want)
		}
	}
}

func TestRecordChecklistNote_LegacyFieldsStillAccepted(t *testing.T) {
	row, err := recordNote(t, domain.ChecklistTypeTest, usecase.RecordChecklistInput{
		Status:       domain.CheckStatusNotOK,
		RejectedDesc: "seal failed",
	})
	if err != nil {
		t.Fatal(err)
	}
	if row.RejectedDesc != "seal failed" || row.ApprovedDesc != "" {
		t.Errorf("unexpected row %+v", row)
	}
}

func TestRecordChecklistNote_BlankNoteStillRequiredForFailures(t *testing.T) {
	_, err := recordNote(t, domain.ChecklistTypeEOL, usecase.RecordChecklistInput{Status: domain.CheckStatusRework, Note: "   "})
	if !errors.Is(err, domain.ErrDescriptionRequired) {
		t.Fatalf("expected ErrDescriptionRequired, got %v", err)
	}
}

func TestChecklistNotes_NoteForReadsOwnedColumn(t *testing.T) {
	n := domain.ChecklistNotes{Rework: "r", Conditional: "c", Rejected: "x", Approved: "a"}
	for status, want := range map[domain.CheckStatus]string{
		domain.CheckStatusOK: "a", domain.CheckStatusConditionalOK: "c",
		domain.CheckStatusNotOK: "x", domain.CheckStatusRework: "r",
		domain.CheckStatusPending: "",
	} {
		if got := n.NoteFor(status); got != want {
			t.Errorf("%s: got %q, want %q", status, got, want)
		}
	}
}
