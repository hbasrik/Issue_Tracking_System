package postgres

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/repository"
)

// AuditRepo is the Postgres-backed AuditRepository (append-only).
type AuditRepo struct {
	pool *pgxpool.Pool
}

// NewAuditRepo constructs an AuditRepo.
func NewAuditRepo(pool *pgxpool.Pool) *AuditRepo {
	return &AuditRepo{pool: pool}
}

var _ repository.AuditRepository = (*AuditRepo)(nil)

// Append inserts a new audit log row.
func (r *AuditRepo) Append(ctx context.Context, entry domain.AuditLog) error {
	_, err := executor(ctx, r.pool).Exec(ctx,
		`INSERT INTO audit_logs
		    (vin, event_type, old_value, new_value, station_id, performed_by, metadata)
		 VALUES ($1, $2, NULLIF($3, ''), NULLIF($4, ''), $5, $6, $7)`,
		entry.VIN, string(entry.EventType), entry.OldValue, entry.NewValue,
		entry.StationID, entry.PerformedBy, entry.Metadata)
	return err
}

// ListIssueStatusHistory returns ISSUE_STATUS_CHANGE rows for one issue,
// oldest first. Statuses live on old_value/new_value; issue_id is in metadata.
func (r *AuditRepo) ListIssueStatusHistory(ctx context.Context, issueID int64) ([]domain.IssueStatusHistoryEntry, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT a.id,
		        COALESCE(NULLIF(a.old_value, ''), a.metadata->>'from_status', ''),
		        COALESCE(NULLIF(a.new_value, ''), a.metadata->>'to_status', ''),
		        COALESCE(u.full_name, ''),
		        a.event_at
		 FROM audit_logs a
		 LEFT JOIN users u ON u.id = a.performed_by
		 WHERE a.event_type = 'ISSUE_STATUS_CHANGE'
		   AND (a.metadata->>'issue_id')::bigint = $1
		 ORDER BY a.event_at ASC, a.id ASC`, issueID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []domain.IssueStatusHistoryEntry
	for rows.Next() {
		var e domain.IssueStatusHistoryEntry
		if err := rows.Scan(&e.ID, &e.FromStatus, &e.ToStatus, &e.ActorName, &e.EventAt); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

// ListVehicleStatusHistory returns STATUS_CHANGE rows for one VIN, oldest
// first. performed_by is left-joined so a deactivated user still shows.
func (r *AuditRepo) ListVehicleStatusHistory(ctx context.Context, vin string) ([]domain.VehicleStatusHistoryEntry, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT a.id,
		        COALESCE(a.old_value, ''),
		        COALESCE(a.new_value, ''),
		        COALESCE(u.full_name, ''),
		        a.event_at
		 FROM audit_logs a
		 LEFT JOIN users u ON u.id = a.performed_by
		 WHERE a.vin = $1 AND a.event_type = 'STATUS_CHANGE'
		 ORDER BY a.event_at ASC, a.id ASC`, vin)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []domain.VehicleStatusHistoryEntry
	for rows.Next() {
		var e domain.VehicleStatusHistoryEntry
		if err := rows.Scan(&e.ID, &e.FromStatus, &e.ToStatus, &e.ActorName, &e.EventAt); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}
