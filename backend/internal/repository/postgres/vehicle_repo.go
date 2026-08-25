package postgres

import (
	"context"
	"errors"
	"fmt"
	"strings"

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

const vehicleColumns = `vin, vehicle_model_id,
	current_global_status, current_station_id, total_progress_percentage,
	eol_template_id, shipment_template_id, test_template_id, created_at, updated_at`

func scanVehicle(row pgx.Row) (*domain.Vehicle, error) {
	var v domain.Vehicle
	var status string
	if err := row.Scan(
		&v.VIN, &v.VehicleModelID, &status, &v.CurrentStationID,
		&v.TotalProgressPercentage, &v.EOLTemplateID, &v.ShipmentTemplateID,
		&v.TestTemplateID, &v.CreatedAt, &v.UpdatedAt,
	); err != nil {
		return nil, err
	}
	v.CurrentGlobalStatus = domain.VehicleStatus(status)
	return &v, nil
}

// GetByVIN returns the vehicle with the exact VIN.
func (r *VehicleRepo) GetByVIN(ctx context.Context, vin string) (*domain.Vehicle, error) {
	row := executor(ctx, r.pool).QueryRow(ctx, `SELECT `+vehicleColumns+` FROM vehicles WHERE vin = $1`, vin)
	v, err := scanVehicle(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, domain.ErrNotFound
	}
	return v, err
}

// vehicleFilterClause builds a shared WHERE fragment for List and Count.
// PLANNED VINs are always excluded from the Vehicles table (Karar 10).
func vehicleFilterClause(f domain.VehicleListFilter) (string, []any) {
	var conds []string
	var args []any

	if f.AnalysisStat == domain.VehicleAnalysisStatOnLine {
		conds = append(conds, "current_global_status = 'IN_PRODUCTION'")
	} else {
		conds = append(conds, "current_global_status <> 'PLANNED'")
	}

	if f.VINContains != "" {
		args = append(args, f.VINContains)
		conds = append(conds, fmt.Sprintf("vin ILIKE '%%' || $%d || '%%'", len(args)))
	}
	if f.Status != nil {
		args = append(args, string(*f.Status))
		conds = append(conds, fmt.Sprintf("current_global_status = $%d", len(args)))
	}
	if f.ModelID != nil {
		args = append(args, *f.ModelID)
		conds = append(conds, fmt.Sprintf("vehicle_model_id = $%d", len(args)))
	}
	if f.StationID != nil {
		args = append(args, *f.StationID)
		conds = append(conds, fmt.Sprintf("current_station_id = $%d", len(args)))
	}

	switch f.AnalysisStat {
	case domain.VehicleAnalysisStatShippedToday, domain.VehicleAnalysisStatShippedWeek:
		args = append(args, f.WindowFrom, f.WindowUntil)
		fromN, untilN := len(args)-1, len(args)
		conds = append(conds, fmt.Sprintf(`EXISTS (
			SELECT 1 FROM (
				SELECT vin, document_approved_at AS at
				FROM vehicle_eol_workflow
				WHERE document_approved_at IS NOT NULL
				UNION ALL
				SELECT vin, event_at
				FROM audit_logs
				WHERE event_type = 'STATUS_CHANGE' AND new_value = 'SHIPPED'
			) s
			WHERE s.vin = vehicles.vin
			  AND ($%d::timestamptz IS NULL OR s.at >= $%d)
			  AND ($%d::timestamptz IS NULL OR s.at < $%d)
		)`, fromN, fromN, untilN, untilN))
	case domain.VehicleAnalysisStatDepotReleased:
		args = append(args, f.WindowFrom, f.WindowUntil)
		fromN, untilN := len(args)-1, len(args)
		conds = append(conds, fmt.Sprintf(`EXISTS (
			SELECT 1 FROM vehicle_eol_workflow w
			WHERE w.vin = vehicles.vin
			  AND w.depot_released_at IS NOT NULL
			  AND ($%d::timestamptz IS NULL OR w.depot_released_at >= $%d)
			  AND ($%d::timestamptz IS NULL OR w.depot_released_at < $%d)
		)`, fromN, fromN, untilN, untilN))
	}

	return " WHERE " + strings.Join(conds, " AND "), args
}

// List returns a filtered, paginated page of non-PLANNED vehicles.
func (r *VehicleRepo) List(ctx context.Context, f domain.VehicleListFilter) ([]domain.Vehicle, error) {
	where, args := vehicleFilterClause(f)
	args = append(args, f.Limit, f.Offset)
	query := `SELECT ` + vehicleColumns + ` FROM vehicles` + where +
		fmt.Sprintf(" ORDER BY vin DESC LIMIT $%d OFFSET $%d", len(args)-1, len(args))

	rows, err := r.pool.Query(ctx, query, args...)
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

// Count returns the number of vehicles matching the filter (ignoring paging).
func (r *VehicleRepo) Count(ctx context.Context, f domain.VehicleListFilter) (int, error) {
	where, args := vehicleFilterClause(f)
	var total int
	err := r.pool.QueryRow(ctx, `SELECT count(*) FROM vehicles`+where, args...).Scan(&total)
	return total, err
}

// SearchByVINSuffix returns vehicles whose VIN contains the given fragment,
// including PLANNED (Karar 10 — issue-entry typeahead must see the full plan).
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

// UpdateProgress persists the recomputed completion percentage and station.
func (r *VehicleRepo) UpdateProgress(ctx context.Context, vin string, percentage float64, currentStationID *int) error {
	tag, err := executor(ctx, r.pool).Exec(ctx,
		`UPDATE vehicles SET total_progress_percentage = $2, current_station_id = $3 WHERE vin = $1`,
		vin, percentage, currentStationID)
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
	tag, err := executor(ctx, r.pool).Exec(ctx,
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

// BulkInsertPlanned inserts the given VINs as PLANNED. Conflicts are skipped.
func (r *VehicleRepo) BulkInsertPlanned(ctx context.Context, vins []string) ([]string, error) {
	if len(vins) == 0 {
		return nil, nil
	}
	rows, err := executor(ctx, r.pool).Query(ctx,
		`INSERT INTO vehicles (vin, current_global_status)
		 SELECT v, 'PLANNED'::vehicle_status_enum
		 FROM unnest($1::text[]) AS v
		 ON CONFLICT (vin) DO NOTHING
		 RETURNING vin`, vins)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var created []string
	for rows.Next() {
		var vin string
		if err := rows.Scan(&vin); err != nil {
			return nil, err
		}
		created = append(created, vin)
	}
	return created, rows.Err()
}
