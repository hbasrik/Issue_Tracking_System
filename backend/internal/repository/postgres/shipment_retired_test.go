package postgres

import (
	"errors"
	"strconv"
	"testing"

	"github.com/jackc/pgx/v5"

	"github.com/karea/backend/internal/domain"
)

// TestShipmentTemplateHiddenFromAdmin reads an existing SHIPMENT template
// (migrations 0001/0002) and proves the template admin cannot see it
// (Karar 33). Nothing is written.
func TestShipmentTemplateHiddenFromAdmin(t *testing.T) {
	ctx, tx := stageTestTx(t)
	var shipID int
	err := tx.QueryRow(ctx, `SELECT id FROM checklist_templates WHERE type = 'SHIPMENT' ORDER BY id LIMIT 1`).Scan(&shipID)
	if errors.Is(err, pgx.ErrNoRows) {
		t.Skip("no SHIPMENT template in this database")
	}
	if err != nil {
		t.Fatal(err)
	}
	repo := NewChecklistProgressRepo(nil)

	if _, err := repo.GetTemplate(ctx, shipID); !errors.Is(err, domain.ErrNotFound) {
		t.Errorf("GetTemplate(%d) err = %v, want ErrNotFound", shipID, err)
	}
	list, err := repo.ListTemplates(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(list) == 0 {
		t.Fatal("ListTemplates returned nothing")
	}
	for _, row := range list {
		if row.Type == domain.ChecklistTypeShipment || row.ID == shipID {
			t.Errorf("ListTemplates returned SHIPMENT template %+v", row)
		}
	}
}

// TestShipmentProgressMediaTypeRejected proves a photo cannot be attached to
// a leftover SHIPMENT progress row: the type lookup refuses it before the
// media handler picks an edit permission.
func TestShipmentProgressMediaTypeRejected(t *testing.T) {
	ctx, tx := stageTestTx(t)
	var progressID int64
	err := tx.QueryRow(ctx, `SELECT id FROM checklist_item_progress WHERE checklist_type = 'SHIPMENT' ORDER BY id LIMIT 1`).Scan(&progressID)
	if errors.Is(err, pgx.ErrNoRows) {
		t.Skip("no SHIPMENT progress row in this database")
	}
	if err != nil {
		t.Fatal(err)
	}
	media := NewMediaRepo(nil)
	if _, err := media.ChecklistTypeForProgressID(ctx, strconv.FormatInt(progressID, 10)); !errors.Is(err, domain.ErrInvalidEnumValue) {
		t.Errorf("ChecklistTypeForProgressID(%d) err = %v, want ErrInvalidEnumValue", progressID, err)
	}
}
