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
		 FROM eol_and_shipment_checklist_progress
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

// ListItemsWithProgress joins template items with per-vehicle progress.
func (r *ChecklistProgressRepo) ListItemsWithProgress(ctx context.Context, vin string, checklistType domain.ChecklistType, templateID int) ([]domain.ChecklistItemView, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT cti.id, cti.item_no, cti.item_text,
		        COALESCE(p.check_status::text, 'PENDING'),
		        COALESCE(p.rework_desc, ''), COALESCE(p.conditional_desc, ''), COALESCE(p.rejected_desc, '')
		 FROM checklist_template_items cti
		 LEFT JOIN eol_and_shipment_checklist_progress p
		   ON p.check_item_id = cti.id AND p.vin = $1 AND p.checklist_type = $2
		 WHERE cti.template_id = $3 AND cti.is_active = TRUE
		 ORDER BY cti.item_no`, vin, string(checklistType), templateID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []domain.ChecklistItemView
	for rows.Next() {
		var item domain.ChecklistItemView
		var status string
		if err := rows.Scan(
			&item.ItemID, &item.ItemNo, &item.ItemText, &status,
			&item.ReworkDesc, &item.ConditionalDesc, &item.RejectedDesc,
		); err != nil {
			return nil, err
		}
		item.Status = domain.CheckStatus(status)
		out = append(out, item)
	}
	return out, rows.Err()
}

// SaveResult updates a pre-materialized checklist progress row. The mandatory
// description columns are also enforced by the chk_description_required_by_status
// database constraint (defense in depth).
func (r *ChecklistProgressRepo) SaveResult(ctx context.Context, result domain.ChecklistProgress) error {
	tag, err := r.pool.Exec(ctx,
		`UPDATE eol_and_shipment_checklist_progress
		 SET check_status = $3,
		     checker_id = $4,
		     check_date = now(),
		     rework_desc = NULLIF($5, ''),
		     conditional_desc = NULLIF($6, ''),
		     rejected_desc = NULLIF($7, '')
		 WHERE vin = $1 AND check_item_id = $2 AND checklist_type = $8`,
		result.VIN, result.CheckItemID, string(result.CheckStatus), result.CheckerID,
		result.ReworkDesc, result.ConditionalDesc, result.RejectedDesc, string(result.ChecklistType))
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrNotFound
	}
	return nil
}
