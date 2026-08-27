package postgres

import (
	"context"
	"errors"

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
	rows, err := r.pool.Query(ctx,
		`SELECT id, vin, checklist_type, check_item_id, check_status, checker_id, check_date,
		        COALESCE(rework_desc, ''), COALESCE(conditional_desc, ''), COALESCE(rejected_desc, ''),
		        related_issue_id, created_at, updated_at
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
			&p.RelatedIssueID, &p.CreatedAt, &p.UpdatedAt,
		); err != nil {
			return nil, err
		}
		p.ChecklistType = domain.ChecklistType(clType)
		p.CheckStatus = domain.CheckStatus(status)
		out = append(out, p)
	}
	return out, rows.Err()
}

// ResolveDefaultTemplateID returns the active default template for a type.
func (r *ChecklistProgressRepo) ResolveDefaultTemplateID(ctx context.Context, checklistType domain.ChecklistType) (int, error) {
	var id int
	err := r.pool.QueryRow(ctx,
		`SELECT id FROM checklist_templates
		 WHERE vehicle_model_id IS NULL AND type = $1 AND is_active = TRUE
		 ORDER BY id LIMIT 1`, string(checklistType)).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, domain.ErrNotFound
	}
	if err != nil {
		return 0, err
	}
	return id, nil
}

// ListItemsWithProgress returns only rows that were materialized onto the
// vehicle. Starting from checklist_item_progress (INNER JOIN) means a
// catalogue item added later is not backfilled onto existing VINs, and a
// deactivated item still appears on vehicles that already have progress.
func (r *ChecklistProgressRepo) ListItemsWithProgress(ctx context.Context, vin string, checklistType domain.ChecklistType, templateID int) ([]domain.ChecklistItemView, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT cti.id, cti.item_no, cti.item_text,
		        COALESCE(p.check_status::text, 'PENDING'),
		        COALESCE(p.rework_desc, ''), COALESCE(p.conditional_desc, ''), COALESCE(p.rejected_desc, ''),
		        cti.eol_phase::text, p.id,
		        p.check_date, COALESCE(checker.full_name, ''),
		        p.rejected_date, COALESCE(rej.full_name, ''),
		        p.approved_date, COALESCE(appr.full_name, '')
		 FROM checklist_item_progress p
		 JOIN checklist_template_items cti ON cti.id = p.check_item_id
		 LEFT JOIN users checker ON checker.id = p.checker_id
		 LEFT JOIN users rej ON rej.id = p.rejected_by
		 LEFT JOIN users appr ON appr.id = p.approved_by
		 WHERE p.vin = $1 AND p.checklist_type = $2
		   AND cti.template_id = $3
		 ORDER BY cti.item_no`, vin, string(checklistType), templateID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []domain.ChecklistItemView
	for rows.Next() {
		var item domain.ChecklistItemView
		var status string
		var eolPhase *string
		if err := rows.Scan(
			&item.ItemID, &item.ItemNo, &item.ItemText, &status,
			&item.ReworkDesc, &item.ConditionalDesc, &item.RejectedDesc,
			&eolPhase, &item.ProgressID,
			&item.CheckDate, &item.CheckerName,
			&item.RejectedAt, &item.RejectedByName,
			&item.ApprovedAt, &item.ApprovedByName,
		); err != nil {
			return nil, err
		}
		item.Status = domain.CheckStatus(status)
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

// SaveResult updates a pre-materialized checklist progress row. The mandatory
// description columns are also enforced by the chk_description_required_by_status
// database constraint (EoL only). Depot sequencing is enforced by
// trg_enforce_eol_depot_after_branch; RAISE EXCEPTION is mapped so the API
// returns the trigger message instead of a generic 500.
func (r *ChecklistProgressRepo) SaveResult(ctx context.Context, result domain.ChecklistProgress) error {
	tag, err := r.pool.Exec(ctx,
		`UPDATE checklist_item_progress
		 SET check_status = $3::check_status_enum,
		     checker_id = $4,
		     check_date = now(),
		     rework_desc = NULLIF($5, ''),
		     conditional_desc = NULLIF($6, ''),
		     rejected_desc = NULLIF($7, ''),
		     rejected_by = CASE WHEN $3::check_status_enum = 'NOT_OK' THEN $4 ELSE rejected_by END,
		     rejected_date = CASE WHEN $3::check_status_enum = 'NOT_OK' THEN now() ELSE rejected_date END,
		     approved_by = CASE WHEN $3::check_status_enum IN ('OK', 'CONDITIONAL_OK') THEN $4 ELSE approved_by END,
		     approved_date = CASE WHEN $3::check_status_enum IN ('OK', 'CONDITIONAL_OK') THEN now() ELSE approved_date END
		 WHERE vin = $1 AND check_item_id = $2 AND checklist_type = $8`,
		result.VIN, result.CheckItemID, string(result.CheckStatus), result.CheckerID,
		result.ReworkDesc, result.ConditionalDesc, result.RejectedDesc, string(result.ChecklistType))
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
	rows, err := r.pool.Query(ctx,
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

// ListTemplateItems returns every item of one template (including inactive).
func (r *ChecklistProgressRepo) ListTemplateItems(ctx context.Context, templateID int) ([]domain.ChecklistTemplateItem, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, template_id, item_no, item_text, station_id, eol_phase::text, is_active
		 FROM checklist_template_items
		 WHERE template_id = $1
		 ORDER BY item_no`, templateID)
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

const templateItemColumns = `id, template_id, item_no, item_text, station_id, eol_phase::text, is_active`

// GetTemplate returns one checklist_templates row.
func (r *ChecklistProgressRepo) GetTemplate(ctx context.Context, templateID int) (*domain.ChecklistTemplate, error) {
	var row domain.ChecklistTemplate
	var typeText string
	err := r.pool.QueryRow(ctx,
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

// GetTemplateItem returns one catalogue item.
func (r *ChecklistProgressRepo) GetTemplateItem(ctx context.Context, itemID int) (*domain.ChecklistTemplateItem, error) {
	return scanTemplateItem(r.pool.QueryRow(ctx,
		`SELECT `+templateItemColumns+` FROM checklist_template_items WHERE id = $1`, itemID))
}

// CreateTemplateItem inserts a catalogue item with the next item_no.
func (r *ChecklistProgressRepo) CreateTemplateItem(ctx context.Context, item *domain.ChecklistTemplateItem) (*domain.ChecklistTemplateItem, error) {
	var phase any
	if item.EolPhase != nil {
		phase = string(*item.EolPhase)
	}
	return scanTemplateItem(r.pool.QueryRow(ctx,
		`INSERT INTO checklist_template_items (template_id, item_no, item_text, station_id, eol_phase, is_active)
		 VALUES (
		   $1,
		   COALESCE((SELECT MAX(item_no) FROM checklist_template_items WHERE template_id = $1), 0) + 1,
		   $2, $3, $4, TRUE
		 )
		 RETURNING `+templateItemColumns,
		item.TemplateID, item.ItemText, item.StationID, phase))
}

// UpdateTemplateItem persists item_text, eol_phase and is_active.
func (r *ChecklistProgressRepo) UpdateTemplateItem(ctx context.Context, item *domain.ChecklistTemplateItem) error {
	var phase any
	if item.EolPhase != nil {
		phase = string(*item.EolPhase)
	}
	tag, err := r.pool.Exec(ctx,
		`UPDATE checklist_template_items
		 SET item_text = $2, eol_phase = $3, is_active = $4
		 WHERE id = $1`,
		item.ID, item.ItemText, phase, item.IsActive)
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
	tag, err := r.pool.Exec(ctx,
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
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

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
	return tx.Commit(ctx)
}

// CountProgressVINs returns distinct vehicles with progress for this item.
func (r *ChecklistProgressRepo) CountProgressVINs(ctx context.Context, itemID int) (int, error) {
	var n int
	err := r.pool.QueryRow(ctx,
		`SELECT COUNT(DISTINCT vin)::int FROM checklist_item_progress WHERE check_item_id = $1`,
		itemID).Scan(&n)
	return n, err
}
