package postgres

import (
	"strconv"
	"testing"

	"github.com/karea/backend/internal/domain"
)

// TestListItemsWithProgress_ReturnsEveryPhoto attaches three photos to one
// EoL progress row and checks the item list returns all three, oldest first,
// while other items carry an empty list. Rolled back.
func TestListItemsWithProgress_ReturnsEveryPhoto(t *testing.T) {
	ctx, tx := stageTestTx(t)

	var vin string
	var itemID, templateID int
	var progressID int64
	err := tx.QueryRow(ctx, `
		SELECT p.vin, p.check_item_id, cti.template_id, p.id
		FROM checklist_item_progress p
		JOIN checklist_template_items cti ON cti.id = p.check_item_id
		WHERE p.checklist_type = 'EOL' AND cti.is_active
		ORDER BY p.vin, cti.item_no LIMIT 1`).Scan(&vin, &itemID, &templateID, &progressID)
	if err != nil {
		t.Fatalf("no EoL progress row: %v", err)
	}
	for i, name := range []string{"first.jpg", "second.jpg", "third.jpg"} {
		if _, err := tx.Exec(ctx, `
			INSERT INTO media_attachments (entity_type, entity_id, vin, file_name, storage_path, mime_type, file_size, uploaded_at)
			VALUES ('CHECKLIST_ITEM_PROGRESS', $1, $2, $3::text, 'test/' || $3::text, 'image/jpeg', 100,
			        now() + make_interval(secs => $4::int))`,
			strconv.FormatInt(progressID, 10), vin, name, i); err != nil {
			t.Fatal(err)
		}
	}

	items, err := NewChecklistProgressRepo(nil).ListItemsWithProgress(ctx, vin, domain.ChecklistTypeEOL, templateID)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, it := range items {
		if it.Photos == nil {
			t.Fatalf("item %d: Photos is nil, want empty slice", it.ItemID)
		}
		if it.ItemID != itemID {
			if len(it.Photos) != 0 {
				t.Errorf("item %d: unexpected photos %+v", it.ItemID, it.Photos)
			}
			continue
		}
		found = true
		var names []string
		for _, p := range it.Photos {
			names = append(names, p.FileName)
			if p.EntityType != domain.MediaEntityChecklistItemProgress || p.VIN != vin || p.UploadedAt.IsZero() {
				t.Errorf("photo fields not decoded: %+v", p)
			}
		}
		if len(names) != 3 || names[0] != "first.jpg" || names[2] != "third.jpg" {
			t.Errorf("photos = %v, want first, second, third", names)
		}
		t.Logf("item %d (progress %d): %d photos %v; %d items in list", itemID, progressID, len(names), names, len(items))
	}
	if !found {
		t.Fatalf("item %d not in list", itemID)
	}
}
