package postgres

import (
	"testing"

	"github.com/karea/backend/internal/domain"
)

// TestListByVIN_LeavesOutChecklistItemPhotos attaches one photo of every
// entity type to a vehicle and checks the gallery keeps all but the checklist
// item photo. Rolled back.
func TestListByVIN_LeavesOutChecklistItemPhotos(t *testing.T) {
	ctx, tx := stageTestTx(t)

	var vin string
	if err := tx.QueryRow(ctx, `SELECT vin FROM vehicles ORDER BY vin LIMIT 1`).Scan(&vin); err != nil {
		t.Fatalf("no vehicle: %v", err)
	}
	before := map[domain.MediaEntityType]int{}
	existing, err := NewMediaRepo(nil).ListByVIN(ctx, vin)
	if err != nil {
		t.Fatal(err)
	}
	for _, m := range existing {
		before[m.EntityType]++
	}

	all := []domain.MediaEntityType{
		domain.MediaEntityVehicle, domain.MediaEntityIssue, domain.MediaEntityIssueResolution,
		domain.MediaEntityStationStepProgress, domain.MediaEntityChecklistItemProgress,
	}
	for _, et := range all {
		if _, err := tx.Exec(ctx, `
			INSERT INTO media_attachments (entity_type, entity_id, vin, file_name, storage_path, mime_type, file_size)
			VALUES ($1, '1', $2, 'gallery.jpg', $3, 'image/jpeg', 100)`,
			string(et), vin, "test/gallery-"+string(et)+".jpg"); err != nil {
			t.Fatal(err)
		}
	}

	got, err := NewMediaRepo(nil).ListByVIN(ctx, vin)
	if err != nil {
		t.Fatal(err)
	}
	after := map[domain.MediaEntityType]int{}
	for _, m := range got {
		after[m.EntityType]++
	}
	for _, et := range all {
		want := before[et] + 1
		if et == domain.MediaEntityChecklistItemProgress {
			want = 0
		}
		if after[et] != want {
			t.Errorf("%s: %d rows, want %d", et, after[et], want)
		}
	}
	t.Logf("vin %s gallery by type: %v", vin, after)
}
