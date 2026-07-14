package postgres

import (
	"context"

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
