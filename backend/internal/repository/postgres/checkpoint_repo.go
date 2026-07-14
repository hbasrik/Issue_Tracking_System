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

// ListCatalogueWithProgress joins active catalogue checkpoints with progress
// rows for the given VIN.
func (r *CheckpointProgressRepo) ListCatalogueWithProgress(ctx context.Context, vin string) ([]domain.CheckpointItemView, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT c.id, c.phase_number, c.sequence_no, c.name, c.station_id,
		        COALESCE(p.status::text, 'PENDING'), p.related_issue_id
		 FROM checkpoints c
		 LEFT JOIN production_phase_progress p
		   ON p.checkpoint_id = c.id AND p.vin = $1
		 WHERE c.is_active = TRUE
		 ORDER BY c.phase_number, c.sequence_no`, vin)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []domain.CheckpointItemView
	for rows.Next() {
		var item domain.CheckpointItemView
		var status string
		if err := rows.Scan(
			&item.ID, &item.PhaseNumber, &item.SequenceNo, &item.Name, &item.StationID,
			&status, &item.RelatedIssueID,
		); err != nil {
			return nil, err
		}
		item.Status = domain.CheckpointStatus(status)
		out = append(out, item)
	}
	return out, rows.Err()
}

// CountOpenIssuesByPhase counts issues in OPEN, IN_PROGRESS, or DONE status
// grouped by the phase of their source checkpoint.
func (r *CheckpointProgressRepo) CountOpenIssuesByPhase(ctx context.Context, vin string) (map[int16]int, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT c.phase_number, count(*)
		 FROM issue_list i
		 JOIN checkpoints c ON i.source_checkpoint_id = c.id
		 WHERE i.vin = $1
		   AND i.status IN ('OPEN', 'IN_PROGRESS', 'DONE')
		 GROUP BY c.phase_number`, vin)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make(map[int16]int)
	for rows.Next() {
		var phase int16
		var count int
		if err := rows.Scan(&phase, &count); err != nil {
			return nil, err
		}
		out[phase] = count
	}
	return out, rows.Err()
}
