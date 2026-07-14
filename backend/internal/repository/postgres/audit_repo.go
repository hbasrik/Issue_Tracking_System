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
		    (vin, event_type, old_value, new_value, phase_number, station_id, performed_by, metadata)
		 VALUES ($1, $2, NULLIF($3, ''), NULLIF($4, ''), $5, $6, $7, $8)`,
		entry.VIN, string(entry.EventType), entry.OldValue, entry.NewValue,
		entry.PhaseNumber, entry.StationID, entry.PerformedBy, entry.Metadata)
	return err
}
