package usecase_test

import (
	"context"
	"errors"
	"reflect"
	"strings"
	"testing"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/usecase"
)

// TestRecordChecklist_FrozenItemRefused covers Karar 29 in the application
// layer: an item whose stage is behind the vehicle is refused with the 409
// sentinel for its reason, before anything is written — the row and the
// audit log stay exactly as they were.
func TestRecordChecklist_FrozenItemRefused(t *testing.T) {
	const vin = "N7V1K1SA1TK000012"
	cases := []struct {
		name   string
		typ    domain.ChecklistType
		reason domain.ChecklistFrozenReason
		want   error
	}{
		{"branch item after branch ship", domain.ChecklistTypeEOL, domain.ChecklistFrozenBranchShipped, domain.ErrChecklistFrozenBranchShipped},
		{"test item after branch ship", domain.ChecklistTypeTest, domain.ChecklistFrozenBranchShipped, domain.ErrChecklistFrozenBranchShipped},
		{"depot item after depot release", domain.ChecklistTypeEOL, domain.ChecklistFrozenDepotReleased, domain.ErrChecklistFrozenDepotReleased},
		{"any item of a delivered vehicle", domain.ChecklistTypeEOL, domain.ChecklistFrozenDelivered, domain.ErrChecklistFrozenDelivered},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			vehicles := newFakeVehicleRepo()
			vehicles.vehicles[vin] = &domain.Vehicle{VIN: vin, CurrentGlobalStatus: domain.VehicleStatusInWarehouse}
			checklist := newFakeChecklistRepo()
			checklist.rows[vin] = []domain.ChecklistProgress{
				{VIN: vin, ChecklistType: tc.typ, CheckItemID: 1, CheckStatus: domain.CheckStatusOK, ApprovedDesc: "fine"},
			}
			pid := int64(1)
			checklist.views[vin+"|"+string(tc.typ)] = []domain.ChecklistItemView{
				{ItemID: 1, Status: domain.CheckStatusOK, ProgressID: &pid, IsActive: true, FrozenReason: tc.reason},
			}
			audit := newFakeAuditRepo()
			rowsBefore := append([]domain.ChecklistProgress(nil), checklist.rows[vin]...)

			rec := usecase.NewChecklistResultRecorder(vehicles, checklist, audit, nil)
			_, err := rec.Record(context.Background(), usecase.RecordChecklistInput{
				VIN: vin, ChecklistType: tc.typ, ItemID: 1,
				Status: domain.CheckStatusNotOK, Note: "late change", CheckerID: 7,
			})
			if !errors.Is(err, tc.want) {
				t.Fatalf("err = %v, want %v", err, tc.want)
			}
			if !reflect.DeepEqual(checklist.rows[vin], rowsBefore) {
				t.Errorf("row changed: %+v, want %+v", checklist.rows[vin], rowsBefore)
			}
			if len(audit.entries) != 0 {
				t.Errorf("audit rows = %d, want 0", len(audit.entries))
			}
		})
	}
}

// TestRecordChecklist_NotFrozenItemWrites is the control: the same write on
// an item whose stage is still open goes through and is audited.
func TestRecordChecklist_NotFrozenItemWrites(t *testing.T) {
	const vin = "N7V1K1SA9TK000002"
	vehicles := newFakeVehicleRepo()
	vehicles.vehicles[vin] = &domain.Vehicle{VIN: vin, CurrentGlobalStatus: domain.VehicleStatusInProduction}
	checklist := newFakeChecklistRepo()
	checklist.rows[vin] = []domain.ChecklistProgress{
		{VIN: vin, ChecklistType: domain.ChecklistTypeTest, CheckItemID: 1, CheckStatus: domain.CheckStatusPending},
	}
	audit := newFakeAuditRepo()
	rec := usecase.NewChecklistResultRecorder(vehicles, checklist, audit, nil)
	if _, err := rec.Record(context.Background(), usecase.RecordChecklistInput{
		VIN: vin, ChecklistType: domain.ChecklistTypeTest, ItemID: 1,
		Status: domain.CheckStatusOK, CheckerID: 7,
	}); err != nil {
		t.Fatal(err)
	}
	if got := checklist.rows[vin][0].CheckStatus; got != domain.CheckStatusOK {
		t.Errorf("status = %s, want OK", got)
	}
	if len(audit.entries) != 1 {
		t.Errorf("audit rows = %d, want 1", len(audit.entries))
	}
}

// TestUploadMedia_FrozenChecklistItemRefused: no new photo on a frozen item,
// refused before the file is stored, so nothing lands on disk or in the table.
func TestUploadMedia_FrozenChecklistItemRefused(t *testing.T) {
	media := newFakeMediaRepo()
	media.existing[string(domain.MediaEntityChecklistItemProgress)+"|1145"] = "N7V1K1SA1TK000012"
	media.frozen = map[string]domain.ChecklistFrozenReason{"1145": domain.ChecklistFrozenBranchShipped}
	store := &fakeMediaStore{}
	uploader := usecase.NewMediaUploader(media, store)

	_, err := uploader.Upload(context.Background(), usecase.UploadMediaInput{
		EntityType: domain.MediaEntityChecklistItemProgress,
		EntityID:   "1145",
		FileName:   "late.jpg",
		MimeType:   "image/jpeg",
		Content:    strings.NewReader(string(tinyJPEG(t))),
		UploadedBy: 7,
	})
	if !errors.Is(err, domain.ErrChecklistFrozenBranchShipped) {
		t.Fatalf("err = %v, want ErrChecklistFrozenBranchShipped", err)
	}
	if len(media.rows) != 0 || len(store.saved) != 0 {
		t.Errorf("rows = %d, stored = %v; want nothing", len(media.rows), store.saved)
	}
}

// TestUploadMedia_OpenChecklistItemAccepted is the control for the photo lock.
func TestUploadMedia_OpenChecklistItemAccepted(t *testing.T) {
	media := newFakeMediaRepo()
	media.existing[string(domain.MediaEntityChecklistItemProgress)+"|105"] = "N7V1K1SA9TK000002"
	store := &fakeMediaStore{}
	uploader := usecase.NewMediaUploader(media, store)

	if _, err := uploader.Upload(context.Background(), usecase.UploadMediaInput{
		EntityType: domain.MediaEntityChecklistItemProgress,
		EntityID:   "105",
		FileName:   "ok.jpg",
		MimeType:   "image/jpeg",
		Content:    strings.NewReader(string(tinyJPEG(t))),
		UploadedBy: 7,
	}); err != nil {
		t.Fatal(err)
	}
	if len(media.rows) != 1 || len(store.saved) != 1 {
		t.Errorf("rows = %d, stored = %v; want one each", len(media.rows), store.saved)
	}
}
