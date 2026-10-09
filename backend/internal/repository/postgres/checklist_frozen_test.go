package postgres

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"strconv"
	"testing"

	"github.com/jackc/pgx/v5"

	"github.com/karea/backend/internal/domain"
)

// frozenRow is one progress row with the reason the trigger function gives.
type frozenRow struct {
	id     int64
	vin    string
	typ    domain.ChecklistType
	itemID int
	reason string
}

// TestChecklistFrozen_ReasonMatchesTrigger: the reason the API reads
// (checklistFrozenReasonSQL) equals fn_checklist_item_frozen_reason
// (migration 0040) on every progress row, before and after a vehicle is
// delivered. Rolled back.
func TestChecklistFrozen_ReasonMatchesTrigger(t *testing.T) {
	ctx, tx := stageTestTx(t)
	compare := func(label string) {
		var differ, total int
		if err := tx.QueryRow(ctx, `
			SELECT count(*) FILTER (WHERE a IS DISTINCT FROM b), count(*)
			FROM (
			  SELECT `+checklistFrozenReasonSQL("v", "w", "p.checklist_type", "cti.eol_phase")+` AS a,
			         CASE WHEN f.msg IS NULL THEN NULL
			              WHEN f.msg = $1 THEN 'DELIVERED'
			              WHEN f.msg = $2 THEN 'BRANCH_SHIPPED'
			              WHEN f.msg = $3 THEN 'DEPOT_RELEASED'
			              ELSE 'UNKNOWN'
			         END AS b
			  FROM checklist_item_progress p
			  CROSS JOIN LATERAL (SELECT fn_checklist_item_frozen_reason(p.vin, p.checklist_type, p.check_item_id) AS msg) f
			  JOIN checklist_template_items cti ON cti.id = p.check_item_id
			  JOIN vehicles v ON v.vin = p.vin
			  LEFT JOIN vehicle_eol_workflow w ON w.vin = p.vin
			) x`,
			domain.ErrChecklistFrozenDelivered.Error(),
			domain.ErrChecklistFrozenBranchShipped.Error(),
			domain.ErrChecklistFrozenDepotReleased.Error(),
		).Scan(&differ, &total); err != nil {
			t.Fatal(err)
		}
		if total == 0 || differ != 0 {
			t.Errorf("%s: %d of %d rows differ", label, differ, total)
		}
		t.Logf("%s: %d rows, %d differ", label, total, differ)
	}
	compare("seeded")
	deliverOne(ctx, t, tx)
	compare("after deliver")
}

// TestChecklistFrozen_WritesRefused: for each reason, SaveResult and a new
// photo on a frozen row are refused with the domain sentinel, the row is
// unchanged and no media row appears; ListItemsWithProgress carries the
// reason. An open row still saves. Rolled back.
func TestChecklistFrozen_WritesRefused(t *testing.T) {
	ctx, tx := stageTestTx(t)
	deliverOne(ctx, t, tx)
	repo := NewChecklistProgressRepo(nil)
	media := NewMediaRepo(nil)

	want := map[string]error{
		"BRANCH_SHIPPED": domain.ErrChecklistFrozenBranchShipped,
		"DEPOT_RELEASED": domain.ErrChecklistFrozenDepotReleased,
		"DELIVERED":      domain.ErrChecklistFrozenDelivered,
	}
	for reason, sentinel := range want {
		for _, typ := range []domain.ChecklistType{domain.ChecklistTypeEOL, domain.ChecklistTypeTest} {
			row, ok := findFrozenRow(ctx, t, tx, reason, typ)
			if !ok {
				continue
			}
			label := reason + " " + string(typ) + " progress " + strconv.FormatInt(row.id, 10)
			before := rowMD5(ctx, t, tx, row.id)
			mediaBefore := countMedia(ctx, t, tx)

			err := inSavepoint(ctx, t, tx, func(ctx context.Context) error {
				return repo.SaveResult(ctx, domain.ChecklistProgress{
					VIN: row.vin, ChecklistType: row.typ, CheckItemID: row.itemID,
					CheckStatus: domain.CheckStatusNotOK, RejectedDesc: "frozen probe", CheckerID: ptrInt(1),
				})
			})
			if !errors.Is(err, sentinel) {
				t.Errorf("%s: SaveResult err = %v, want %v", label, err, sentinel)
			}
			err = inSavepoint(ctx, t, tx, func(ctx context.Context) error {
				_, err := media.Create(ctx, &domain.MediaAttachment{
					EntityType: domain.MediaEntityChecklistItemProgress, EntityID: strconv.FormatInt(row.id, 10),
					VIN: row.vin, FileName: "probe.jpg", StoragePath: "probe/probe.jpg", MimeType: "image/jpeg", FileSize: 1,
				})
				return err
			})
			if !errors.Is(err, sentinel) {
				t.Errorf("%s: media Create err = %v, want %v", label, err, sentinel)
			}
			got, err := media.ChecklistFrozenReasonForProgressID(ctx, strconv.FormatInt(row.id, 10))
			if err != nil || string(got) != reason {
				t.Errorf("%s: ChecklistFrozenReasonForProgressID = %q, %v", label, got, err)
			}
			if after := rowMD5(ctx, t, tx, row.id); after != before {
				t.Errorf("%s: row md5 %s -> %s", label, before, after)
			}
			if after := countMedia(ctx, t, tx); after != mediaBefore {
				t.Errorf("%s: media rows %d -> %d", label, mediaBefore, after)
			}
			t.Logf("%s: refused, row md5 %s unchanged", label, before)
		}
	}

	var vin string
	var itemID int
	if err := tx.QueryRow(ctx, `
		SELECT p.vin, p.check_item_id FROM checklist_item_progress p
		WHERE p.checklist_type = 'TEST'
		  AND fn_checklist_item_frozen_reason(p.vin, p.checklist_type, p.check_item_id) IS NULL
		ORDER BY p.id LIMIT 1`).Scan(&vin, &itemID); err != nil {
		t.Fatal(err)
	}
	if err := inSavepoint(ctx, t, tx, func(ctx context.Context) error {
		return repo.SaveResult(ctx, domain.ChecklistProgress{
			VIN: vin, ChecklistType: domain.ChecklistTypeTest, CheckItemID: itemID,
			CheckStatus: domain.CheckStatusOK, CheckerID: ptrInt(1),
		})
	}); err != nil {
		t.Errorf("open TEST item on %s: %v", vin, err)
	}
}

// TestChecklistFrozen_EOLAndTestReadPath: on the API read path every EOL and
// TEST item carries the Karar 29 reason (DELIVERED; EOL DEPOT after depot
// release; everything else after branch ship), with or without a SHIPMENT
// template on the vehicle. The digest over (vin, type, item, reason,
// StageClosed) is logged so runs on different commits can be compared.
// Rolled back.
func TestChecklistFrozen_EOLAndTestReadPath(t *testing.T) {
	ctx, tx := stageTestTx(t)
	deliverOne(ctx, t, tx)
	repo := NewChecklistProgressRepo(nil)
	vehicles := loadStageVehicles(ctx, t, tx)

	digest := func(label string) string {
		h := sha256.New()
		counts := map[string]int{}
		for _, v := range vehicles {
			for _, tc := range []struct {
				typ domain.ChecklistType
				col string
			}{
				{domain.ChecklistTypeEOL, "eol_template_id"},
				{domain.ChecklistTypeTest, "test_template_id"},
			} {
				typ, col := tc.typ, tc.col
				var tmpl *int
				if err := tx.QueryRow(ctx, `SELECT `+col+` FROM vehicles WHERE vin = $1`, v.vin).Scan(&tmpl); err != nil {
					t.Fatal(err)
				}
				if tmpl == nil {
					continue
				}
				items, err := repo.ListItemsWithProgress(ctx, v.vin, typ, *tmpl)
				if err != nil {
					t.Fatal(err)
				}
				for _, it := range items {
					want := domain.ChecklistFrozenReason("")
					switch {
					case v.terminal():
						want = domain.ChecklistFrozenDelivered
					case typ == domain.ChecklistTypeEOL && it.EolPhase != nil && *it.EolPhase == domain.EOLItemPhaseDepot:
						if v.depotReleased {
							want = domain.ChecklistFrozenDepotReleased
						}
					case v.branchShipped:
						want = domain.ChecklistFrozenBranchShipped
					}
					if it.FrozenReason != want {
						t.Errorf("%s %s %s item %d: frozen %q, want %q", label, v.vin, typ, it.ItemID, it.FrozenReason, want)
					}
					counts[string(typ)+" "+string(it.FrozenReason)]++
					fmt.Fprintf(h, "%s|%s|%d|%s|%t\n", v.vin, typ, it.ItemID, it.FrozenReason, it.StageClosed)
				}
			}
		}
		sum := hex.EncodeToString(h.Sum(nil))
		t.Logf("%s: digest %s counts %v", label, sum, counts)
		return sum
	}

	before := digest("seeded")
	var vins []string
	for _, v := range vehicles {
		vins = append(vins, v.vin)
	}
	if _, err := tx.Exec(ctx, `UPDATE vehicles SET shipment_template_id = NULL WHERE vin = ANY($1)`, vins); err != nil {
		t.Fatal(err)
	}
	if got := digest("no shipment template"); got != before {
		t.Errorf("EOL/TEST read path changed when the SHIPMENT template was removed: %s → %s", before, got)
	}
}

func deliverOne(ctx context.Context, t *testing.T, tx pgx.Tx) {
	t.Helper()
	tag, err := tx.Exec(ctx, `
		UPDATE vehicle_eol_workflow SET delivered_at = now(), delivered_by = (SELECT min(id) FROM users)
		WHERE vin = (SELECT vin FROM vehicle_eol_workflow
		             WHERE depot_released_at IS NOT NULL AND delivered_at IS NULL ORDER BY vin LIMIT 1)`)
	if err != nil || tag.RowsAffected() != 1 {
		t.Fatalf("deliver: %v (%d rows)", err, tag.RowsAffected())
	}
}

func findFrozenRow(ctx context.Context, t *testing.T, tx pgx.Tx, reason string, typ domain.ChecklistType) (frozenRow, bool) {
	t.Helper()
	var r frozenRow
	var rawType string
	err := tx.QueryRow(ctx, `
		SELECT p.id, p.vin, p.checklist_type::text, p.check_item_id
		FROM checklist_item_progress p
		JOIN checklist_template_items cti ON cti.id = p.check_item_id
		JOIN vehicles v ON v.vin = p.vin
		LEFT JOIN vehicle_eol_workflow w ON w.vin = p.vin
		WHERE p.checklist_type = $2
		  AND `+checklistFrozenReasonSQL("v", "w", "p.checklist_type", "cti.eol_phase")+` = $1
		ORDER BY p.id LIMIT 1`, reason, string(typ)).Scan(&r.id, &r.vin, &rawType, &r.itemID)
	if errors.Is(err, pgx.ErrNoRows) {
		return r, false
	}
	if err != nil {
		t.Fatal(err)
	}
	r.typ = domain.ChecklistType(rawType)
	r.reason = reason
	return r, true
}

func inSavepoint(ctx context.Context, t *testing.T, tx pgx.Tx, fn func(context.Context) error) error {
	t.Helper()
	sp, err := tx.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = sp.Rollback(ctx) }()
	return fn(context.WithValue(ctx, txContextKey{}, sp))
}

func rowMD5(ctx context.Context, t *testing.T, tx pgx.Tx, id int64) string {
	t.Helper()
	var h string
	if err := tx.QueryRow(ctx, `SELECT md5(p::text) FROM checklist_item_progress p WHERE id = $1`, id).Scan(&h); err != nil {
		t.Fatal(err)
	}
	return h
}

func countMedia(ctx context.Context, t *testing.T, tx pgx.Tx) int {
	t.Helper()
	var n int
	if err := tx.QueryRow(ctx, `SELECT count(*) FROM media_attachments`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

func ptrInt(v int) *int { return &v }
