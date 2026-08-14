package postgres

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/repository"
)

// StationRepo is the Postgres-backed StationRepository.
type StationRepo struct {
	pool *pgxpool.Pool
}

// NewStationRepo constructs a StationRepo.
func NewStationRepo(pool *pgxpool.Pool) *StationRepo {
	return &StationRepo{pool: pool}
}

var _ repository.StationRepository = (*StationRepo)(nil)

// List returns all stations in line order.
func (r *StationRepo) List(ctx context.Context) ([]domain.Station, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, name, sequence_no, is_active FROM stations
		 ORDER BY sequence_no`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []domain.Station
	for rows.Next() {
		var s domain.Station
		if err := rows.Scan(&s.ID, &s.Name, &s.SequenceNo, &s.IsActive); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}
