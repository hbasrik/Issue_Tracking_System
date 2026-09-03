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

// ListRecent returns the newest audit rows with the acting user's name/email
// and checklist item context when present in metadata.
func (r *AuditRepo) ListRecent(ctx context.Context, limit int) ([]domain.HomeActivityEntry, error) {
	if limit <= 0 {
		limit = 8
	}
	page, err := r.ListActivity(ctx, domain.AuditActivityFilter{Limit: limit})
	if err != nil {
		return nil, err
	}
	return page.Items, nil
}

// ListActivity returns a filtered, newest-first page of plant-wide audit rows.
func (r *AuditRepo) ListActivity(ctx context.Context, f domain.AuditActivityFilter) (*domain.AuditActivityPage, error) {
	limit := f.Limit
	if limit <= 0 {
		limit = 50
	}
	if limit > 200 {
		limit = 200
	}
	offset := f.Offset
	if offset < 0 {
		offset = 0
	}

	const where = `
		 WHERE ($1::timestamptz IS NULL OR a.event_at >= $1)
		   AND ($2::timestamptz IS NULL OR a.event_at < $2)
		   AND ($3::text = '' OR a.event_type::text = $3)
		   AND ($4::int IS NULL OR a.performed_by = $4)
		   AND ($5::text = '' OR right(a.vin, length($5)) = $5)
		   AND ($6::text = '' OR COALESCE(u.full_name, '') ILIKE '%' || $6 || '%'
		        OR COALESCE(u.email, '') ILIKE '%' || $6 || '%')
		   AND a.event_type IN (
		          'ISSUE_STATUS_CHANGE',
		          'STATUS_CHANGE',
		          'EOL_WORKFLOW_STAGE_CHANGE',
		          'CHECKLIST_ITEM_UPDATE',
		          'MEDIA_UPLOADED',
		          'LOCATION_CHANGE',
		          'STATION_ENTER',
		          'STATION_EXIT'
		        )`

	eventType := f.EventType
	vinSuffix := f.VINSuffix
	actorQuery := f.ActorQuery

	var total int64
	if err := r.pool.QueryRow(ctx,
		`SELECT count(*)::bigint
		   FROM audit_logs a
		   LEFT JOIN users u ON u.id = a.performed_by`+where,
		f.From, f.To, eventType, f.ActorID, vinSuffix, actorQuery,
	).Scan(&total); err != nil {
		return nil, err
	}

	rows, err := r.pool.Query(ctx,
		`SELECT a.event_at,
		        a.event_type::text,
		        a.vin,
		        COALESCE(a.old_value, ''),
		        COALESCE(a.new_value, ''),
		        COALESCE(u.full_name, ''),
		        COALESCE(u.email, ''),
		        COALESCE(a.metadata->>'checklist_type', ''),
		        CASE
		          WHEN a.metadata ? 'item_id' THEN (a.metadata->>'item_id')::int
		          ELSE NULL
		        END,
		        COALESCE(cti.item_no, 0),
		        COALESCE(cti.item_text, '')
		   FROM audit_logs a
		   LEFT JOIN users u ON u.id = a.performed_by
		   LEFT JOIN checklist_template_items cti
		          ON a.event_type = 'CHECKLIST_ITEM_UPDATE'
		         AND a.metadata ? 'item_id'
		         AND cti.id = (a.metadata->>'item_id')::int`+where+`
		  ORDER BY a.event_at DESC, a.id DESC
		  LIMIT $7 OFFSET $8`,
		f.From, f.To, eventType, f.ActorID, vinSuffix, actorQuery, limit, offset,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]domain.HomeActivityEntry, 0, limit)
	for rows.Next() {
		var e domain.HomeActivityEntry
		var metaItemID *int
		var itemNo int
		if err := rows.Scan(
			&e.EventAt, &e.EventType, &e.VIN, &e.OldValue, &e.NewValue,
			&e.ActorName, &e.ActorEmail, &e.ChecklistType, &metaItemID,
			&itemNo, &e.ItemText,
		); err != nil {
			return nil, err
		}
		if itemNo > 0 {
			n := itemNo
			e.ItemNo = &n
		} else if metaItemID != nil {
			e.ItemNo = metaItemID
		}
		out = append(out, e)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return &domain.AuditActivityPage{Items: out, Total: total}, nil
}
