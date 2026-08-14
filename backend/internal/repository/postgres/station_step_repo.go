package postgres

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/repository"
)

// StationStepProgressRepo is the Postgres-backed StationStepProgressRepository.
type StationStepProgressRepo struct {
	pool *pgxpool.Pool
}

// NewStationStepProgressRepo constructs a StationStepProgressRepo.
func NewStationStepProgressRepo(pool *pgxpool.Pool) *StationStepProgressRepo {
	return &StationStepProgressRepo{pool: pool}
}

var _ repository.StationStepProgressRepository = (*StationStepProgressRepo)(nil)

// ListByVIN returns all station step progress rows for a vehicle, ordered the
// way an operator walks the line.
func (r *StationStepProgressRepo) ListByVIN(ctx context.Context, vin string) ([]domain.VehicleStationStepProgress, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT vssp.id, vssp.vin, vssp.station_id, vssp.station_step_id, vssp.status,
		        vssp.checked_by, vssp.checked_at, vssp.related_issue_id,
		        vssp.created_at, vssp.updated_at
		 FROM vehicle_station_step_progress vssp
		 JOIN stations s ON s.id = vssp.station_id
		 JOIN station_steps ss ON ss.id = vssp.station_step_id
		 WHERE vssp.vin = $1
		 ORDER BY s.sequence_no, ss.sequence_no`, vin)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []domain.VehicleStationStepProgress
	for rows.Next() {
		var p domain.VehicleStationStepProgress
		var status string
		if err := rows.Scan(
			&p.ID, &p.VIN, &p.StationID, &p.StationStepID, &status,
			&p.CheckedBy, &p.CheckedAt, &p.RelatedIssueID, &p.CreatedAt, &p.UpdatedAt,
		); err != nil {
			return nil, err
		}
		p.Status = domain.StationStepStatus(status)
		out = append(out, p)
	}
	return out, rows.Err()
}

// SaveResult updates a pre-materialized station step progress row. The row is
// created by the fn_initialize_vehicle_progress trigger when the vehicle is
// inserted, so this is always an UPDATE.
func (r *StationStepProgressRepo) SaveResult(ctx context.Context, vin string, stationStepID int, status domain.StationStepStatus, checkedBy int) error {
	tag, err := executor(ctx, r.pool).Exec(ctx,
		`UPDATE vehicle_station_step_progress
		 SET status = $3, checked_by = $4, checked_at = now()
		 WHERE vin = $1 AND station_step_id = $2`,
		vin, stationStepID, string(status), checkedBy)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrNotFound
	}
	return nil
}

// ListCatalogueWithProgress joins active station steps with progress rows for
// the given VIN.
func (r *StationStepProgressRepo) ListCatalogueWithProgress(ctx context.Context, vin string) ([]domain.StationStepItemView, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT ss.id, ss.station_id, s.name, ss.sequence_no, ss.name,
		        COALESCE(vssp.status::text, 'PENDING'), vssp.related_issue_id
		 FROM station_steps ss
		 JOIN stations s ON s.id = ss.station_id
		 LEFT JOIN vehicle_station_step_progress vssp
		   ON vssp.station_step_id = ss.id AND vssp.vin = $1
		 WHERE ss.is_active = TRUE AND s.is_active = TRUE
		 ORDER BY s.sequence_no, ss.sequence_no`, vin)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []domain.StationStepItemView
	for rows.Next() {
		var item domain.StationStepItemView
		var status string
		if err := rows.Scan(
			&item.ID, &item.StationID, &item.StationName, &item.SequenceNo, &item.Name,
			&status, &item.RelatedIssueID,
		); err != nil {
			return nil, err
		}
		item.Status = domain.StationStepStatus(status)
		out = append(out, item)
	}
	return out, rows.Err()
}

// CountOpenIssuesByStation counts issues in OPEN, IN_PROGRESS, or DONE status
// grouped by the station of their source station step.
func (r *StationStepProgressRepo) CountOpenIssuesByStation(ctx context.Context, vin string) (map[int]int, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT ss.station_id, count(*)
		 FROM issue_list i
		 JOIN station_steps ss ON i.source_station_step_id = ss.id
		 WHERE i.vin = $1
		   AND i.status IN ('OPEN', 'IN_PROGRESS', 'DONE')
		 GROUP BY ss.station_id`, vin)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make(map[int]int)
	for rows.Next() {
		var stationID, count int
		if err := rows.Scan(&stationID, &count); err != nil {
			return nil, err
		}
		out[stationID] = count
	}
	return out, rows.Err()
}
