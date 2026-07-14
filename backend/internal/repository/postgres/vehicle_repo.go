package postgres

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/repository"
)

// VehicleRepo is the Postgres-backed VehicleRepository.
type VehicleRepo struct {
	pool *pgxpool.Pool
}

// NewVehicleRepo constructs a VehicleRepo.
func NewVehicleRepo(pool *pgxpool.Pool) *VehicleRepo {
	return &VehicleRepo{pool: pool}
}

var _ repository.VehicleRepository = (*VehicleRepo)(nil)

const vehicleColumns = `vin, vehicle_model_id, current_global_status, current_phase,
	total_progress_percentage, eol_template_id, shipment_template_id, created_at, updated_at`

func scanVehicle(row pgx.Row) (*domain.Vehicle, error) {
	var v domain.Vehicle
	var status string
	if err := row.Scan(
		&v.VIN, &v.VehicleModelID, &status, &v.CurrentPhase,
		&v.TotalProgressPercentage, &v.EOLTemplateID, &v.ShipmentTemplateID,
		&v.CreatedAt, &v.UpdatedAt,
	); err != nil {
		return nil, err
	}
	v.CurrentGlobalStatus = domain.VehicleStatus(status)
	return &v, nil
}

// GetByVIN returns the vehicle with the exact VIN.
func (r *VehicleRepo) GetByVIN(ctx context.Context, vin string) (*domain.Vehicle, error) {
	row := r.pool.QueryRow(ctx, `SELECT `+vehicleColumns+` FROM vehicles WHERE vin = $1`, vin)
	v, err := scanVehicle(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, domain.ErrNotFound
	}
	return v, err
}

// SearchByVINSuffix returns vehicles whose VIN contains the given fragment,
// relying on the trigram GIN index (idx_vehicles_vin_trgm).
func (r *VehicleRepo) SearchByVINSuffix(ctx context.Context, suffix string, limit int) ([]domain.Vehicle, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT `+vehicleColumns+` FROM vehicles WHERE vin ILIKE '%' || $1 || '%' ORDER BY vin LIMIT $2`,
		suffix, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []domain.Vehicle
	for rows.Next() {
		v, err := scanVehicle(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *v)
	}
	return out, rows.Err()
}

// UpdateProgress persists the recomputed completion percentage and phase.
func (r *VehicleRepo) UpdateProgress(ctx context.Context, vin string, percentage float64, currentPhase int16) error {
	tag, err := r.pool.Exec(ctx,
		`UPDATE vehicles SET total_progress_percentage = $2, current_phase = $3 WHERE vin = $1`,
		vin, percentage, currentPhase)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrNotFound
	}
	return nil
}

// UpdateStatus persists a new global status. The database's
// fn_enforce_manual_status_change trigger provides a second, independent guard.
func (r *VehicleRepo) UpdateStatus(ctx context.Context, vin string, status domain.VehicleStatus) error {
	tag, err := r.pool.Exec(ctx,
		`UPDATE vehicles SET current_global_status = $2 WHERE vin = $1`,
		vin, string(status))
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrNotFound
	}
	return nil
}
