package postgres

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/repository"
)

// AnalysisRepo reads the Analysis-tab SQL views defined in the initial
// migration. Filters that the underlying view does not expose as a column are
// ignored (the views are the reporting contract); richer per-row filtering
// belongs to dedicated queries in a later iteration.
type AnalysisRepo struct {
	pool *pgxpool.Pool
}

// NewAnalysisRepo constructs an AnalysisRepo.
func NewAnalysisRepo(pool *pgxpool.Pool) *AnalysisRepo {
	return &AnalysisRepo{pool: pool}
}

var _ repository.AnalysisRepository = (*AnalysisRepo)(nil)

// dayRangeClause builds a "WHERE day BETWEEN ..." fragment for the day-keyed
// views, returning the SQL and its positional args.
func dayRangeClause(column string, f domain.AnalysisFilter) (string, []any) {
	var conds []string
	var args []any
	if f.From != nil {
		args = append(args, *f.From)
		conds = append(conds, fmt.Sprintf("%s >= $%d", column, len(args)))
	}
	if f.To != nil {
		args = append(args, *f.To)
		conds = append(conds, fmt.Sprintf("%s <= $%d", column, len(args)))
	}
	if len(conds) == 0 {
		return "", args
	}
	return " WHERE " + strings.Join(conds, " AND "), args
}

// DailyPendingIssues returns rows of vw_daily_pending_issues.
func (r *AnalysisRepo) DailyPendingIssues(ctx context.Context, f domain.AnalysisFilter) ([]domain.DailyPendingIssue, error) {
	where, args := dayRangeClause("day", f)
	rows, err := r.pool.Query(ctx, `SELECT day, pending_count FROM vw_daily_pending_issues`+where+` ORDER BY day`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []domain.DailyPendingIssue
	for rows.Next() {
		var d domain.DailyPendingIssue
		if err := rows.Scan(&d.Day, &d.PendingCount); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

// CompletedIssuesDaily returns rows of vw_completed_issues_daily.
func (r *AnalysisRepo) CompletedIssuesDaily(ctx context.Context, f domain.AnalysisFilter) ([]domain.CompletedIssuesDaily, error) {
	where, args := dayRangeClause("day", f)
	rows, err := r.pool.Query(ctx, `SELECT day, completed_count FROM vw_completed_issues_daily`+where+` ORDER BY day`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []domain.CompletedIssuesDaily
	for rows.Next() {
		var d domain.CompletedIssuesDaily
		if err := rows.Scan(&d.Day, &d.CompletedCount); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

// DefectRatePerStation returns rows of vw_defect_rate_per_station.
func (r *AnalysisRepo) DefectRatePerStation(ctx context.Context, _ domain.AnalysisFilter) ([]domain.StationDefectRate, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT station_id, station_name, vehicles_with_issue, issue_count
		 FROM vw_defect_rate_per_station ORDER BY issue_count DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []domain.StationDefectRate
	for rows.Next() {
		var s domain.StationDefectRate
		if err := rows.Scan(&s.StationID, &s.StationName, &s.VehiclesWithIssue, &s.IssueCount); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

// MTTRPerStation returns rows of vw_issue_mttr. The interval is converted to
// seconds via EXTRACT(EPOCH ...) and mapped to a time.Duration.
func (r *AnalysisRepo) MTTRPerStation(ctx context.Context, _ domain.AnalysisFilter) ([]domain.StationMTTR, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT station_id, EXTRACT(EPOCH FROM mean_time_to_resolve)
		 FROM vw_issue_mttr WHERE station_id IS NOT NULL`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []domain.StationMTTR
	for rows.Next() {
		var s domain.StationMTTR
		var seconds float64
		if err := rows.Scan(&s.StationID, &seconds); err != nil {
			return nil, err
		}
		s.MeanTimeToResolve = time.Duration(seconds * float64(time.Second))
		out = append(out, s)
	}
	return out, rows.Err()
}

// VehicleSeverityBreakdown returns rows of
// vw_vehicle_open_issue_severity_breakdown.
func (r *AnalysisRepo) VehicleSeverityBreakdown(ctx context.Context, f domain.AnalysisFilter) ([]domain.VehicleSeverityBreakdown, error) {
	query := `SELECT vin, total_open_issues, critical_count, medium_count, low_count
	          FROM vw_vehicle_open_issue_severity_breakdown`
	var args []any
	if f.VINSuffix != "" {
		args = append(args, f.VINSuffix)
		query += fmt.Sprintf(" WHERE vin ILIKE '%%' || $%d || '%%'", len(args))
	}
	query += " ORDER BY total_open_issues DESC"

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []domain.VehicleSeverityBreakdown
	for rows.Next() {
		var v domain.VehicleSeverityBreakdown
		if err := rows.Scan(&v.VIN, &v.TotalOpenIssues, &v.CriticalCount, &v.MediumCount, &v.LowCount); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}
