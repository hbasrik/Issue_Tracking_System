package postgres

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/repository"
)

// CheckpointProgressRepo is the Postgres-backed CheckpointProgressRepository.
type CheckpointProgressRepo struct {
	pool *pgxpool.Pool
}

// NewCheckpointProgressRepo constructs a CheckpointProgressRepo.
func NewCheckpointProgressRepo(pool *pgxpool.Pool) *CheckpointProgressRepo {
	return &CheckpointProgressRepo{pool: pool}
}

var _ repository.CheckpointProgressRepository = (*CheckpointProgressRepo)(nil)

// ListByVIN returns all checkpoint progress rows for a vehicle.
func (r *CheckpointProgressRepo) ListByVIN(ctx context.Context, vin string) ([]domain.PhaseCheckpointProgress, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, vin, phase_number, checkpoint_id, status, checked_by, checked_at,
		        related_issue_id, created_at, updated_at
		 FROM production_phase_progress
		 WHERE vin = $1
		 ORDER BY phase_number, checkpoint_id`, vin)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []domain.PhaseCheckpointProgress
	for rows.Next() {
		var p domain.PhaseCheckpointProgress
		var status string
		if err := rows.Scan(
			&p.ID, &p.VIN, &p.PhaseNumber, &p.CheckpointID, &status,
			&p.CheckedBy, &p.CheckedAt, &p.RelatedIssueID, &p.CreatedAt, &p.UpdatedAt,
		); err != nil {
			return nil, err
		}
		p.Status = domain.CheckpointStatus(status)
		out = append(out, p)
	}
	return out, rows.Err()
}

// SaveResult updates a pre-materialized checkpoint progress row. The row is
// created by the fn_initialize_vehicle_progress trigger when the vehicle is
// inserted, so this is always an UPDATE.
func (r *CheckpointProgressRepo) SaveResult(ctx context.Context, vin string, checkpointID int, status domain.CheckpointStatus, checkedBy int) error {
	tag, err := r.pool.Exec(ctx,
		`UPDATE production_phase_progress
		 SET status = $3, checked_by = $4, checked_at = now()
		 WHERE vin = $1 AND checkpoint_id = $2`,
		vin, checkpointID, string(status), checkedBy)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrNotFound
	}
	return nil
}
