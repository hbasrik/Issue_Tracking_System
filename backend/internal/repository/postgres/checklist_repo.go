package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/repository"
)

// ChecklistProgressRepo is the Postgres-backed ChecklistProgressRepository.
type ChecklistProgressRepo struct {
	pool *pgxpool.Pool
}

// NewChecklistProgressRepo constructs a ChecklistProgressRepo.
func NewChecklistProgressRepo(pool *pgxpool.Pool) *ChecklistProgressRepo {
	return &ChecklistProgressRepo{pool: pool}
}

var _ repository.ChecklistProgressRepository = (*ChecklistProgressRepo)(nil)

// ListByVINAndType returns all checklist progress rows of a type for a vehicle.
func (r *ChecklistProgressRepo) ListByVINAndType(ctx context.Context, vin string, checklistType domain.ChecklistType) ([]domain.ChecklistProgress, error) {
	rows, err := executor(ctx, r.pool).Query(ctx,
		`SELECT id, vin, checklist_type, check_item_id, check_status, checker_id, check_date,
		        COALESCE(rework_desc, ''), COALESCE(conditional_desc, ''), COALESCE(rejected_desc, ''),
		        COALESCE(approved_desc, ''), related_issue_id, created_at, updated_at
		 FROM checklist_item_progress
		 WHERE vin = $1 AND checklist_type = $2
		 ORDER BY check_item_id`, vin, string(checklistType))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []domain.ChecklistProgress
	for rows.Next() {
		var p domain.ChecklistProgress
		var clType, status string
		if err := rows.Scan(
			&p.ID, &p.VIN, &clType, &p.CheckItemID, &status, &p.CheckerID, &p.CheckDate,
			&p.ReworkDesc, &p.ConditionalDesc, &p.RejectedDesc,
			&p.ApprovedDesc, &p.RelatedIssueID, &p.CreatedAt, &p.UpdatedAt,
		); err != nil {
			return nil, err
		}
		p.ChecklistType = domain.ChecklistType(clType)
		p.CheckStatus = domain.CheckStatus(status)
		out = append(out, p)
	}
	return out, rows.Err()
}

// ResolveDefaultTemplateID returns the preferred active template for a type:
// model-specific when vehicleModelID is set and a matching row exists, else
// the generic (vehicle_model_id IS NULL) template. Mirrors
// domain.PreferredActiveTemplateID / fn_assign_checklist_templates.
func (r *ChecklistProgressRepo) ResolveDefaultTemplateID(ctx context.Context, checklistType domain.ChecklistType, vehicleModelID *int) (int, error) {
	rows, err := executor(ctx, r.pool).Query(ctx,
		`SELECT id, vehicle_model_id, type::text, name, is_active
		 FROM checklist_templates
		 WHERE type = $1 AND is_active = TRUE
		   AND (vehicle_model_id IS NOT DISTINCT FROM $2 OR vehicle_model_id IS NULL)
		 ORDER BY id`, string(checklistType), vehicleModelID)
	if err != nil {
		return 0, err
	}
	defer rows.Close()

	var candidates []domain.ChecklistTemplate
	for rows.Next() {
		var t domain.ChecklistTemplate
		var typ string
		if err := rows.Scan(&t.ID, &t.VehicleModelID, &typ, &t.Name, &t.IsActive); err != nil {
			return 0, err
		}
		t.Type = domain.ChecklistType(typ)
		candidates = append(candidates, t)
	}
	if err := rows.Err(); err != nil {
		return 0, err
	}
	return domain.PreferredActiveTemplateID(candidates, vehicleModelID)
}

// checklistPhotosLateral aggregates every photo of progress row p into one
// JSON array shaped like domain.MediaAttachment, so the item list carries all
// photos in the same statement (no per-item media query).
const checklistPhotosLateral = `
		 LEFT JOIN LATERAL (
		   SELECT COALESCE(json_agg(json_build_object(
		            'id', m.id, 'entity_type', m.entity_type, 'entity_id', m.entity_id,
		            'vin', m.vin, 'file_name', m.file_name, 'storage_path', m.storage_path,
		            'mime_type', COALESCE(m.mime_type, ''), 'file_size', COALESCE(m.file_size, 0),
		            'uploaded_by', m.uploaded_by, 'uploaded_at', m.uploaded_at)
		          ORDER BY m.uploaded_at, m.id), '[]'::json) AS photos
		   FROM media_attachments m
		   WHERE m.entity_type = 'CHECKLIST_ITEM_PROGRESS' AND m.entity_id = p.id::text
		 ) ph ON TRUE`

// ListItemsWithProgress returns every active catalogue item for the template
// (LEFT JOIN progress — missing rows appear as PENDING with nil ProgressID)
// plus inactive items that already have progress so historical ticks stay
// visible. Gates must ignore inactive rows (IsActive=false) and rows whose
// stage is closed (StageClosed, stage_applicability.go).
func (r *ChecklistProgressRepo) ListItemsWithProgress(ctx context.Context, vin string, checklistType domain.ChecklistType, templateID int) ([]domain.ChecklistItemView, error) {
	rows, err := executor(ctx, r.pool).Query(ctx,
		`SELECT cti.id, cti.item_no,
		        COALESCE(NULLIF(trim(p.item_text_snapshot), ''), cti.item_text),
		        COALESCE(p.check_status::text, 'PENDING'),
		        COALESCE(p.rework_desc, ''), COALESCE(p.conditional_desc, ''), COALESCE(p.rejected_desc, ''),
		        COALESCE(p.approved_desc, ''),
		        cti.eol_phase::text, p.id, cti.is_active,
		        cti.section_key, cti.section_sort,
		        NULLIF(trim(cti.acceptance_criterion), ''), NULLIF(trim(cti.control_method), ''),
		        p.check_date, COALESCE(checker.full_name, ''),
		        p.rejected_date, COALESCE(rej.full_name, ''),
		        p.approved_date, COALESCE(appr.full_name, ''),
		        COALESCE(`+checklistStageClosedSQL("v", "w", "t.type", "cti.eol_phase", "p")+`, false),
		        `+checklistFrozenReasonSQL("v", "w", "t.type", "cti.eol_phase")+`,
		        ph.photos
		 FROM checklist_template_items cti
		 JOIN checklist_templates t ON t.id = cti.template_id
		 LEFT JOIN vehicles v ON v.vin = $1
		 LEFT JOIN vehicle_eol_workflow w ON w.vin = $1
		 LEFT JOIN checklist_item_progress p
		   ON p.check_item_id = cti.id AND p.vin = $1 AND p.checklist_type = $2
		 LEFT JOIN users checker ON checker.id = p.checker_id
		 LEFT JOIN users rej ON rej.id = p.rejected_by
		 LEFT JOIN users appr ON appr.id = p.approved_by`+checklistPhotosLateral+`
		 WHERE cti.template_id = $3
		   AND cti.is_active
		 UNION ALL
		 SELECT cti.id, cti.item_no,
		        COALESCE(NULLIF(trim(p.item_text_snapshot), ''), cti.item_text),
		        p.check_status::text,
		        COALESCE(p.rework_desc, ''), COALESCE(p.conditional_desc, ''), COALESCE(p.rejected_desc, ''),
		        COALESCE(p.approved_desc, ''),
		        cti.eol_phase::text, p.id, cti.is_active,
		        cti.section_key, cti.section_sort,
		        NULLIF(trim(cti.acceptance_criterion), ''), NULLIF(trim(cti.control_method), ''),
		        p.check_date, COALESCE(checker.full_name, ''),
		        p.rejected_date, COALESCE(rej.full_name, ''),
		        p.approved_date, COALESCE(appr.full_name, ''),
		        false,
		        `+checklistFrozenReasonSQL("v", "w", "t.type", "cti.eol_phase")+`,
		        ph.photos
		 FROM checklist_item_progress p
		 JOIN checklist_template_items cti ON cti.id = p.check_item_id
		 JOIN checklist_templates t ON t.id = cti.template_id
		 LEFT JOIN vehicles v ON v.vin = p.vin
		 LEFT JOIN vehicle_eol_workflow w ON w.vin = p.vin
		 LEFT JOIN users checker ON checker.id = p.checker_id
		 LEFT JOIN users rej ON rej.id = p.rejected_by
		 LEFT JOIN users appr ON appr.id = p.approved_by`+checklistPhotosLateral+`
		 WHERE p.vin = $1 AND p.checklist_type = $2
		   AND cti.template_id = $3
		   AND NOT cti.is_active
		 ORDER BY 2`, vin, string(checklistType), templateID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []domain.ChecklistItemView
	for rows.Next() {
		var item domain.ChecklistItemView
		var status string
		var eolPhase *string
		var photos []byte
		var frozen *string
		if err := rows.Scan(
			&item.ItemID, &item.ItemNo, &item.ItemText, &status,
			&item.ReworkDesc, &item.ConditionalDesc, &item.RejectedDesc,
			&item.ApprovedDesc,
			&eolPhase, &item.ProgressID, &item.IsActive,
			&item.SectionKey, &item.SectionSort,
			&item.AcceptanceCriterion, &item.ControlMethod,
			&item.CheckDate, &item.CheckerName,
			&item.RejectedAt, &item.RejectedByName,
			&item.ApprovedAt, &item.ApprovedByName,
			&item.StageClosed,
			&frozen,
			&photos,
		); err != nil {
			return nil, err
		}
		item.Photos = []domain.MediaAttachment{}
		if err := json.Unmarshal(photos, &item.Photos); err != nil {
			return nil, fmt.Errorf("checklist photos: %w", err)
		}
		item.Status = domain.CheckStatus(status)
		if frozen != nil {
			item.FrozenReason = domain.ChecklistFrozenReason(*frozen)
		}
		item.Note = domain.ChecklistNotes{
			Rework:      item.ReworkDesc,
			Conditional: item.ConditionalDesc,
			Rejected:    item.RejectedDesc,
			Approved:    item.ApprovedDesc,
		}.NoteFor(item.Status)
		if eolPhase != nil && *eolPhase != "" {
			p := domain.EOLItemPhase(*eolPhase)
			item.EolPhase = &p
		}
		if item.Status == domain.CheckStatusPending {
			item.CheckerName = ""
			item.CheckDate = nil
			item.RejectedByName = ""
			item.RejectedAt = nil
			item.ApprovedByName = ""
			item.ApprovedAt = nil
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

// ListApplicableItems returns the vehicle's applicable items of one checklist
// type (stage_applicability.go): the same set the progress percentage counts.
func (r *ChecklistProgressRepo) ListApplicableItems(ctx context.Context, vin string, checklistType domain.ChecklistType) ([]domain.ChecklistItemView, error) {
	rows, err := executor(ctx, r.pool).Query(ctx,
		`SELECT a.item_id, a.item_no, a.item_text, a.status, a.eol_phase, a.progress_id
		 FROM (`+applicableChecklistItemsSQL("$1")+`) a
		 WHERE a.checklist_type = $2
		 ORDER BY a.item_no`, vin, string(checklistType))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []domain.ChecklistItemView
	for rows.Next() {
		item := domain.ChecklistItemView{IsActive: true}
		var status string
		var eolPhase *string
		if err := rows.Scan(&item.ItemID, &item.ItemNo, &item.ItemText, &status, &eolPhase, &item.ProgressID); err != nil {
			return nil, err
		}
		item.Status = domain.CheckStatus(status)
		if eolPhase != nil && *eolPhase != "" {
			p := domain.EOLItemPhase(*eolPhase)
			item.EolPhase = &p
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

// SaveResult updates a pre-materialized checklist progress row. Actor stamps
// follow the new status: OK/CONDITIONAL_OK write approved_*; NOT_OK writes
// rejected_*; any other status clears both so a later NOT_OK cannot keep an
// older Onay stamp. Description CHECK and depot sequencing stay in the DB.
// Every non-PENDING answer copies the template item's acceptance criterion,
// control method and form revision with criteria_snapshot_at (Karar 30);
// the client never supplies them. PENDING keeps the previous copy.
func (r *ChecklistProgressRepo) SaveResult(ctx context.Context, result domain.ChecklistProgress) error {
	tag, err := executor(ctx, r.pool).Exec(ctx,
		`UPDATE checklist_item_progress p
		 SET check_status = $3::check_status_enum,
		     checker_id = $4::int,
		     check_date = now(),
		     rework_desc = NULLIF($5, ''),
		     conditional_desc = NULLIF($6, ''),
		     rejected_desc = NULLIF($7, ''),
		     approved_desc = NULLIF($9, ''),
		     rejected_by = CASE WHEN $3::check_status_enum = 'NOT_OK' THEN $4::int ELSE NULL END,
		     rejected_date = CASE WHEN $3::check_status_enum = 'NOT_OK' THEN now() ELSE NULL END,
		     approved_by = CASE WHEN $3::check_status_enum IN ('OK', 'CONDITIONAL_OK') THEN $4::int ELSE NULL END,
		     approved_date = CASE WHEN $3::check_status_enum IN ('OK', 'CONDITIONAL_OK') THEN now() ELSE NULL END,
		     item_text_snapshot = CASE
		       WHEN $3::check_status_enum = 'PENDING' THEN p.item_text_snapshot
		       WHEN NULLIF(trim(p.item_text_snapshot), '') IS NOT NULL THEN p.item_text_snapshot
		       ELSE cti.item_text
		     END,
		     acceptance_criterion_snapshot = CASE
		       WHEN $3::check_status_enum = 'PENDING' THEN p.acceptance_criterion_snapshot
		       ELSE NULLIF(trim(cti.acceptance_criterion), '')
		     END,
		     control_method_snapshot = CASE
		       WHEN $3::check_status_enum = 'PENDING' THEN p.control_method_snapshot
		       ELSE NULLIF(trim(cti.control_method), '')
		     END,
		     form_revision_snapshot = CASE
		       WHEN $3::check_status_enum = 'PENDING' THEN p.form_revision_snapshot
		       ELSE NULLIF(trim(cti.form_revision), '')
		     END,
		     criteria_snapshot_at = CASE
		       WHEN $3::check_status_enum = 'PENDING' THEN p.criteria_snapshot_at
		       ELSE now()
		     END
		 FROM checklist_template_items cti
		 WHERE cti.id = p.check_item_id
		   AND p.vin = $1 AND p.check_item_id = $2 AND p.checklist_type = $8`,
		result.VIN, result.CheckItemID, string(result.CheckStatus), result.CheckerID,
		result.ReworkDesc, result.ConditionalDesc, result.RejectedDesc, string(result.ChecklistType),
		result.ApprovedDesc)
	if err != nil {
		return mapRaiseException(err)
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrNotFound
	}
	return nil
}

// ListTemplates returns every checklist template with a live count of its
// active items. Inactive items are excluded from the count so the admin page
// matches what operators see on the vehicle checklists.
func (r *ChecklistProgressRepo) ListTemplates(ctx context.Context) ([]domain.ChecklistTemplateSummary, error) {
	rows, err := executor(ctx, r.pool).Query(ctx,
		`SELECT ct.id, ct.vehicle_model_id, ct.type::text, ct.name, ct.is_active,
		        COUNT(cti.id) FILTER (WHERE cti.is_active = TRUE)::int AS item_count
		 FROM checklist_templates ct
		 LEFT JOIN checklist_template_items cti ON cti.template_id = ct.id
		 GROUP BY ct.id
		 ORDER BY CASE ct.type::text
		            WHEN 'EOL' THEN 1
		            WHEN 'SHIPMENT' THEN 2
		            WHEN 'TEST' THEN 3
		            ELSE 4
		          END,
		          ct.id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []domain.ChecklistTemplateSummary
	for rows.Next() {
		var row domain.ChecklistTemplateSummary
		var typeText string
		if err := rows.Scan(
			&row.ID, &row.VehicleModelID, &typeText, &row.Name, &row.IsActive, &row.ItemCount,
		); err != nil {
			return nil, err
		}
		row.Type = domain.ChecklistType(typeText)
		out = append(out, row)
	}
	return out, rows.Err()
}

const templateItemColumns = `id, template_id, item_no, item_text, station_id, eol_phase::text, is_active, section_key, section_sort`

// ListTemplateItems returns every item of one template (including inactive).
// EvaluatedCount is how many vehicle progress rows are non-PENDING (rename impact).
func (r *ChecklistProgressRepo) ListTemplateItems(ctx context.Context, templateID int) ([]domain.ChecklistTemplateItem, error) {
	rows, err := executor(ctx, r.pool).Query(ctx,
		`SELECT cti.id, cti.template_id, cti.item_no, cti.item_text, cti.station_id, cti.eol_phase::text, cti.is_active,
		        cti.section_key, cti.section_sort,
		        (SELECT count(*)::int FROM checklist_item_progress p
		          WHERE p.check_item_id = cti.id AND p.check_status <> 'PENDING') AS evaluated_count
		 FROM checklist_template_items cti
		 WHERE cti.template_id = $1
		 ORDER BY cti.item_no`, templateID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []domain.ChecklistTemplateItem
	for rows.Next() {
		var item domain.ChecklistTemplateItem
		var eolPhase *string
		if err := rows.Scan(
			&item.ID, &item.TemplateID, &item.ItemNo, &item.ItemText,
			&item.StationID, &eolPhase, &item.IsActive,
			&item.SectionKey, &item.SectionSort, &item.EvaluatedCount,
		); err != nil {
			return nil, err
		}
		if eolPhase != nil && *eolPhase != "" {
			p := domain.EOLItemPhase(*eolPhase)
			item.EolPhase = &p
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

func scanTemplateItem(row pgx.Row) (*domain.ChecklistTemplateItem, error) {
	var item domain.ChecklistTemplateItem
	var eolPhase *string
	if err := row.Scan(
		&item.ID, &item.TemplateID, &item.ItemNo, &item.ItemText,
		&item.StationID, &eolPhase, &item.IsActive,
		&item.SectionKey, &item.SectionSort,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	if eolPhase != nil && *eolPhase != "" {
		p := domain.EOLItemPhase(*eolPhase)
		item.EolPhase = &p
	}
	return &item, nil
}

// GetTemplate returns one checklist_templates row.
func (r *ChecklistProgressRepo) GetTemplate(ctx context.Context, templateID int) (*domain.ChecklistTemplate, error) {
	var row domain.ChecklistTemplate
	var typeText string
	err := executor(ctx, r.pool).QueryRow(ctx,
		`SELECT id, vehicle_model_id, type::text, name, is_active
		 FROM checklist_templates WHERE id = $1`, templateID).
		Scan(&row.ID, &row.VehicleModelID, &typeText, &row.Name, &row.IsActive)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, domain.ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	row.Type = domain.ChecklistType(typeText)
	return &row, nil
}

// GetTemplateItem returns one catalogue item. FOR UPDATE serializes
// delete/update TOCTOU when the caller is already inside a transaction.
func (r *ChecklistProgressRepo) GetTemplateItem(ctx context.Context, itemID int) (*domain.ChecklistTemplateItem, error) {
	return scanTemplateItem(executor(ctx, r.pool).QueryRow(ctx,
		`SELECT `+templateItemColumns+` FROM checklist_template_items WHERE id = $1 FOR UPDATE`, itemID))
}

// CreateTemplateItem inserts a catalogue item with the next item_no.
// Unique (template_id, item_no) turns a concurrent MAX+1 race into
// domain.ErrTemplateItemNoConflict so the usecase can retry in a new tx.
func (r *ChecklistProgressRepo) CreateTemplateItem(ctx context.Context, item *domain.ChecklistTemplateItem) (*domain.ChecklistTemplateItem, error) {
	var phase any
	if item.EolPhase != nil {
		phase = string(*item.EolPhase)
	}
	created, err := scanTemplateItem(executor(ctx, r.pool).QueryRow(ctx,
		`INSERT INTO checklist_template_items (template_id, item_no, item_text, station_id, eol_phase, is_active, section_key, section_sort)
		 VALUES (
		   $1,
		   COALESCE((SELECT MAX(item_no) FROM checklist_template_items WHERE template_id = $1), 0) + 1,
		   $2, $3, $4, TRUE, $5, $6
		 )
		 RETURNING `+templateItemColumns,
		item.TemplateID, item.ItemText, item.StationID, phase, item.SectionKey, item.SectionSort))
	if err != nil {
		if IsUniqueViolation(err) {
			return nil, domain.ErrTemplateItemNoConflict
		}
		return nil, err
	}
	return created, nil
}

// UpdateTemplateItem persists item_text, eol_phase, is_active and section fields.
func (r *ChecklistProgressRepo) UpdateTemplateItem(ctx context.Context, item *domain.ChecklistTemplateItem) error {
	var phase any
	if item.EolPhase != nil {
		phase = string(*item.EolPhase)
	}
	tag, err := executor(ctx, r.pool).Exec(ctx,
		`UPDATE checklist_template_items
		 SET item_text = $2, eol_phase = $3, is_active = $4,
		     section_key = $5, section_sort = $6
		 WHERE id = $1`,
		item.ID, item.ItemText, phase, item.IsActive, item.SectionKey, item.SectionSort)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrNotFound
	}
	return nil
}

// DeleteTemplateItem removes an unused catalogue row.
func (r *ChecklistProgressRepo) DeleteTemplateItem(ctx context.Context, itemID int) error {
	tag, err := executor(ctx, r.pool).Exec(ctx,
		`DELETE FROM checklist_template_items WHERE id = $1`, itemID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrNotFound
	}
	return nil
}

// ReorderTemplateItems assigns item_no 1..n. Temporary negative numbers
// avoid UNIQUE (template_id, item_no) collisions mid-swap.
func (r *ChecklistProgressRepo) ReorderTemplateItems(ctx context.Context, templateID int, itemIDs []int) error {
	return inTx(ctx, r.pool, func(tx dbExecutor) error {
		for i, id := range itemIDs {
			tag, err := tx.Exec(ctx,
				`UPDATE checklist_template_items SET item_no = $1 WHERE id = $2 AND template_id = $3`,
				-(i + 1), id, templateID)
			if err != nil {
				return err
			}
			if tag.RowsAffected() == 0 {
				return domain.ErrNotFound
			}
		}
		for i, id := range itemIDs {
			if _, err := tx.Exec(ctx,
				`UPDATE checklist_template_items SET item_no = $1 WHERE id = $2 AND template_id = $3`,
				i+1, id, templateID); err != nil {
				return err
			}
		}
		return nil
	})
}

// CountEvaluatedProgressVINs returns distinct vehicles with non-PENDING
// progress for this catalogue item.
func (r *ChecklistProgressRepo) CountEvaluatedProgressVINs(ctx context.Context, itemID int) (int, error) {
	var n int
	err := executor(ctx, r.pool).QueryRow(ctx,
		`SELECT COUNT(DISTINCT vin)::int
		 FROM checklist_item_progress
		 WHERE check_item_id = $1 AND check_status <> 'PENDING'`,
		itemID).Scan(&n)
	return n, err
}

// CountIssueLinkedVINs returns distinct vehicles with an issue sourced from
// this catalogue item.
func (r *ChecklistProgressRepo) CountIssueLinkedVINs(ctx context.Context, itemID int) (int, error) {
	var n int
	err := executor(ctx, r.pool).QueryRow(ctx,
		`SELECT COUNT(DISTINCT vin)::int
		 FROM issue_list
		 WHERE source_check_item_id = $1`,
		itemID).Scan(&n)
	return n, err
}

// DeactivateImpact counts PENDING (removable) vs protected history VINs.
func (r *ChecklistProgressRepo) DeactivateImpact(ctx context.Context, itemID int) (affected, protected int, err error) {
	err = executor(ctx, r.pool).QueryRow(ctx, `
		WITH rows AS (
		  SELECT vin, check_status, related_issue_id
		  FROM checklist_item_progress
		  WHERE check_item_id = $1
		),
		issue_vins AS (
		  SELECT DISTINCT vin FROM issue_list WHERE source_check_item_id = $1
		)
		SELECT
		  (SELECT COUNT(*)::int FROM rows
		    WHERE check_status = 'PENDING'
		      AND related_issue_id IS NULL
		      AND vin NOT IN (SELECT vin FROM issue_vins)),
		  (SELECT COUNT(DISTINCT vin)::int FROM (
		     SELECT vin FROM rows
		      WHERE check_status <> 'PENDING' OR related_issue_id IS NOT NULL
		     UNION
		     SELECT vin FROM issue_vins
		   ) p)
	`, itemID).Scan(&affected, &protected)
	return affected, protected, err
}

// CreateImpact counts not-started and incomplete vehicle sets for a template
// item of the given EOL phase (nil for SHIPMENT/TEST). Only vehicles that
// have not passed the item's stage can be affected; vehicles past it and
// completed checklists (progress exists and no PENDING remains) are always
// in the protected bucket.
func (r *ChecklistProgressRepo) CreateImpact(
	ctx context.Context, templateID int, checklistType domain.ChecklistType, eolPhase *domain.EOLItemPhase,
) (
	notStartedAffected, notStartedProtected, incompleteAffected, incompleteProtected int, err error,
) {
	col, err := vehicleTemplateColumn(checklistType)
	if err != nil {
		return 0, 0, 0, 0, err
	}
	var phase *string
	if eolPhase != nil {
		s := string(*eolPhase)
		phase = &s
	}
	q := fmt.Sprintf(`
		WITH assigned AS (
		  SELECT v.vin, %s AS stage_passed
		  FROM vehicles v
		  LEFT JOIN vehicle_eol_workflow w ON w.vin = v.vin
		  WHERE v.%s = $1
		),
		eligible AS (
		  SELECT vin FROM assigned WHERE NOT stage_passed
		),
		started AS (
		  SELECT DISTINCT p.vin
		  FROM checklist_item_progress p
		  JOIN eligible e ON e.vin = p.vin
		  WHERE p.checklist_type = $2 AND p.check_status <> 'PENDING'
		),
		completed AS (
		  SELECT e.vin
		  FROM eligible e
		  WHERE EXISTS (
		    SELECT 1 FROM checklist_item_progress p
		    WHERE p.vin = e.vin AND p.checklist_type = $2
		  )
		  AND NOT EXISTS (
		    SELECT 1 FROM checklist_item_progress p
		    WHERE p.vin = e.vin AND p.checklist_type = $2 AND p.check_status = 'PENDING'
		  )
		),
		counts AS (
		  SELECT
		    (SELECT COUNT(*)::int FROM assigned) AS total,
		    (SELECT COUNT(*)::int FROM eligible e
		      WHERE NOT EXISTS (SELECT 1 FROM started s WHERE s.vin = e.vin)) AS ns_affected,
		    (SELECT COUNT(*)::int FROM eligible e
		      WHERE NOT EXISTS (SELECT 1 FROM completed c WHERE c.vin = e.vin)) AS inc_affected
		)
		SELECT ns_affected, total - ns_affected, inc_affected, total - inc_affected
		FROM counts
	`, checklistStagePassedSQL("v", "w", "$2::checklist_type_enum", "$3::text"), col)
	err = executor(ctx, r.pool).QueryRow(ctx, q, templateID, string(checklistType), phase).Scan(
		&notStartedAffected, &notStartedProtected, &incompleteAffected, &incompleteProtected,
	)
	return notStartedAffected, notStartedProtected, incompleteAffected, incompleteProtected, err
}

// DeletePendingProgressForItem removes removable PENDING rows for the item.
func (r *ChecklistProgressRepo) DeletePendingProgressForItem(ctx context.Context, itemID int) (int64, error) {
	tag, err := executor(ctx, r.pool).Exec(ctx, `
		DELETE FROM checklist_item_progress p
		WHERE p.check_item_id = $1
		  AND p.check_status = 'PENDING'
		  AND p.related_issue_id IS NULL
		  AND NOT EXISTS (
		    SELECT 1 FROM issue_list i
		    WHERE i.source_check_item_id = $1 AND i.vin = p.vin
		  )`, itemID)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}

// InsertPendingForVehicles backfills PENDING onto vehicles selected by scope.
// Only vehicles that have not yet passed the item's stage are eligible
// (stage_applicability.go); completed checklists are never included.
func (r *ChecklistProgressRepo) InsertPendingForVehicles(
	ctx context.Context, itemID, templateID int, checklistType domain.ChecklistType, scope domain.TemplateItemPropagationScope,
) (int64, error) {
	col, err := vehicleTemplateColumn(checklistType)
	if err != nil {
		return 0, err
	}
	var whereExtra string
	switch scope {
	case domain.PropagationScopeNotStarted, "":
		// No evaluated row of this checklist type yet.
		whereExtra = `
		  AND NOT EXISTS (
		    SELECT 1 FROM checklist_item_progress p
		    WHERE p.vin = v.vin
		      AND p.checklist_type = $2::checklist_type_enum
		      AND p.check_status <> 'PENDING'
		  )`
	case domain.PropagationScopeIncomplete:
		// Still incomplete: no progress yet OR any PENDING remains.
		// Explicitly exclude completed (has progress, zero PENDING).
		whereExtra = `
		  AND NOT (
		    EXISTS (
		      SELECT 1 FROM checklist_item_progress p
		      WHERE p.vin = v.vin AND p.checklist_type = $2::checklist_type_enum
		    )
		    AND NOT EXISTS (
		      SELECT 1 FROM checklist_item_progress p
		      WHERE p.vin = v.vin
		        AND p.checklist_type = $2::checklist_type_enum
		        AND p.check_status = 'PENDING'
		    )
		  )`
	default:
		return 0, domain.ErrInvalidEnumValue
	}
	q := fmt.Sprintf(`
		INSERT INTO checklist_item_progress (vin, checklist_type, check_item_id, check_status)
		SELECT v.vin, $2::checklist_type_enum, $3, 'PENDING'
		FROM vehicles v
		JOIN checklist_template_items ci ON ci.id = $3
		LEFT JOIN vehicle_eol_workflow w ON w.vin = v.vin
		WHERE v.%s = $1
		  AND NOT %s
		  AND NOT EXISTS (
		    SELECT 1 FROM checklist_item_progress p
		    WHERE p.vin = v.vin AND p.check_item_id = $3
		  )
		  %s
		ON CONFLICT (vin, check_item_id) DO NOTHING`,
		col, checklistStagePassedSQL("v", "w", "$2::checklist_type_enum", "ci.eol_phase"), whereExtra)
	tag, err := executor(ctx, r.pool).Exec(ctx, q, templateID, string(checklistType), itemID)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}

// ListVehiclesMissingTemplateItem returns assigned VINs without this item
// that should have it: vehicles past the item's stage are not missing it.
func (r *ChecklistProgressRepo) ListVehiclesMissingTemplateItem(
	ctx context.Context, templateID, itemID int, checklistType domain.ChecklistType, limit int,
) ([]domain.TemplateItemMissingVehicle, int, error) {
	col, err := vehicleTemplateColumn(checklistType)
	if err != nil {
		return nil, 0, err
	}
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	from := fmt.Sprintf(`
		FROM vehicles v
		JOIN checklist_template_items ci ON ci.id = $2
		LEFT JOIN vehicle_eol_workflow w ON w.vin = v.vin
		WHERE v.%s = $1
		  AND NOT %s
		  AND NOT EXISTS (
		    SELECT 1 FROM checklist_item_progress p
		    WHERE p.vin = v.vin AND p.check_item_id = $2
		  )`, col, checklistStagePassedSQL("v", "w", "'"+string(checklistType)+"'", "ci.eol_phase"))
	var total int
	if err := executor(ctx, r.pool).QueryRow(ctx, `SELECT COUNT(*)::int`+from, templateID, itemID).Scan(&total); err != nil {
		return nil, 0, err
	}
	listQ := `SELECT v.vin, v.current_global_status::text` + from + `
		ORDER BY v.vin
		LIMIT $3`
	rows, err := executor(ctx, r.pool).Query(ctx, listQ, templateID, itemID, limit)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := make([]domain.TemplateItemMissingVehicle, 0)
	for rows.Next() {
		var row domain.TemplateItemMissingVehicle
		if err := rows.Scan(&row.VIN, &row.CurrentGlobalStatus); err != nil {
			return nil, 0, err
		}
		out = append(out, row)
	}
	return out, total, rows.Err()
}

func vehicleTemplateColumn(checklistType domain.ChecklistType) (string, error) {
	switch checklistType {
	case domain.ChecklistTypeEOL:
		return "eol_template_id", nil
	case domain.ChecklistTypeShipment:
		return "shipment_template_id", nil
	case domain.ChecklistTypeTest:
		return "test_template_id", nil
	default:
		return "", domain.ErrInvalidEnumValue
	}
}
