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
	var vin any
	if entry.VIN != "" {
		vin = entry.VIN
	}
	_, err := executor(ctx, r.pool).Exec(ctx,
		`INSERT INTO audit_logs
		    (vin, event_type, old_value, new_value, station_id, performed_by, metadata)
		 VALUES ($1, $2, NULLIF($3, ''), NULLIF($4, ''), $5, $6, $7)`,
		vin, string(entry.EventType), entry.OldValue, entry.NewValue,
		entry.StationID, entry.PerformedBy, entry.Metadata)
	return err
}

// ListIssueStatusHistory returns one issue's timeline, oldest first: status
// changes (old_value/new_value) and classification corrections (resolved
// field changes). issue_id is in metadata for both event types.
func (r *AuditRepo) ListIssueStatusHistory(ctx context.Context, issueID int64) ([]domain.IssueStatusHistoryEntry, error) {
	q := executor(ctx, r.pool)
	rows, err := q.Query(ctx,
		`SELECT a.id,
		        a.event_type::text,
		        COALESCE(NULLIF(a.old_value, ''), a.metadata->>'from_status', ''),
		        COALESCE(NULLIF(a.new_value, ''), a.metadata->>'to_status', ''),
		        CASE WHEN a.event_type = 'ISSUE_CLASSIFICATION_CHANGE' THEN a.metadata END,
		        COALESCE(u.full_name, ''),
		        a.event_at
		 FROM audit_logs a
		 LEFT JOIN users u ON u.id = a.performed_by
		 WHERE a.event_type IN ('ISSUE_STATUS_CHANGE', 'ISSUE_CLASSIFICATION_CHANGE')
		   AND (a.metadata->>'issue_id')::bigint = $1
		 ORDER BY a.event_at ASC, a.id ASC`, issueID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []domain.IssueStatusHistoryEntry
	var parsed [][]parsedClassificationChange
	var classIdx []int
	for rows.Next() {
		var e domain.IssueStatusHistoryEntry
		var eventType string
		var meta []byte
		if err := rows.Scan(&e.ID, &eventType, &e.FromStatus, &e.ToStatus, &meta, &e.ActorName, &e.EventAt); err != nil {
			return nil, err
		}
		e.Kind = domain.IssueHistoryKindStatus
		if eventType == string(domain.AuditEventIssueClassification) {
			e.Kind = domain.IssueHistoryKindClassification
			e.FromStatus, e.ToStatus = "", ""
			parsed = append(parsed, parseClassificationMetadata(meta))
			classIdx = append(classIdx, len(out))
		}
		out = append(out, e)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	rows.Close()
	resolved, err := resolveClassificationChanges(ctx, q, parsed)
	if err != nil {
		return nil, err
	}
	for i, idx := range classIdx {
		out[idx].Changes = resolved[i]
	}
	return out, nil
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

// ListVehicleTimeline returns one VIN's timeline rows, newest first, with
// checklist item context, issue id, hold/reset/trigger metadata and resolved
// classification changes. One row past the cap is read to set Truncated.
func (r *AuditRepo) ListVehicleTimeline(ctx context.Context, vin string) (*domain.VehicleTimeline, error) {
	q := executor(ctx, r.pool)
	types := make([]string, len(domain.VehicleTimelineEventTypes))
	for i, t := range domain.VehicleTimelineEventTypes {
		types[i] = string(t)
	}
	rows, err := q.Query(ctx,
		`SELECT a.id,
		        a.event_at,
		        a.event_type::text,
		        COALESCE(a.old_value, ''),
		        COALESCE(a.new_value, ''),
		        COALESCE(u.full_name, ''),
		        COALESCE(a.metadata->>'checklist_type', ''),
		        CASE WHEN a.metadata ? 'item_id' THEN (a.metadata->>'item_id')::int END,
		        COALESCE(cti.item_no, 0),
		        COALESCE(btrim(cti.item_text, E' \n'), ''),
		        CASE WHEN a.metadata ? 'issue_id' THEN (a.metadata->>'issue_id')::bigint END,
		        CASE WHEN a.event_type = 'ISSUE_CLASSIFICATION_CHANGE' THEN a.metadata END,
		        COALESCE(a.metadata->>'action', ''),
		        COALESCE(a.metadata->>'trigger', ''),
		        COALESCE(a.metadata->>'hold_reason', ''),
		        COALESCE(a.metadata->>'dev_reset', '') = 'true',
		        CASE WHEN a.metadata ? 'open_issue_count_warning'
		             THEN (a.metadata->>'open_issue_count_warning')::int END
		   FROM audit_logs a
		   LEFT JOIN users u ON u.id = a.performed_by
		   LEFT JOIN checklist_template_items cti
		          ON a.event_type = 'CHECKLIST_ITEM_UPDATE'
		         AND a.metadata ? 'item_id'
		         AND cti.id = (a.metadata->>'item_id')::int
		  WHERE a.vin = $1
		    AND a.event_type::text = ANY($2)
		  ORDER BY a.event_at DESC, a.id DESC
		  LIMIT $3`,
		vin, types, domain.VehicleTimelineLimit+1)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]domain.VehicleTimelineEntry, 0, 64)
	var parsed [][]parsedClassificationChange
	var classIdx []int
	for rows.Next() {
		var e domain.VehicleTimelineEntry
		var metaItemID *int
		var itemNo int
		var classMeta []byte
		if err := rows.Scan(
			&e.ID, &e.EventAt, &e.EventType, &e.OldValue, &e.NewValue,
			&e.ActorName, &e.ChecklistType, &metaItemID, &itemNo, &e.ItemText,
			&e.IssueID, &classMeta, &e.Action, &e.Trigger, &e.HoldReason,
			&e.DevReset, &e.OpenIssueCount,
		); err != nil {
			return nil, err
		}
		if itemNo > 0 {
			n := itemNo
			e.ItemNo = &n
		}
		if e.EventType == string(domain.AuditEventIssueClassification) {
			e.OldValue, e.NewValue = "", ""
			parsed = append(parsed, parseClassificationMetadata(classMeta))
			classIdx = append(classIdx, len(out))
		}
		out = append(out, e)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	rows.Close()

	truncated := len(out) > domain.VehicleTimelineLimit
	if truncated {
		out = out[:domain.VehicleTimelineLimit]
		for len(classIdx) > 0 && classIdx[len(classIdx)-1] >= domain.VehicleTimelineLimit {
			classIdx = classIdx[:len(classIdx)-1]
			parsed = parsed[:len(parsed)-1]
		}
	}
	resolved, err := resolveClassificationChanges(ctx, q, parsed)
	if err != nil {
		return nil, err
	}
	for i, idx := range classIdx {
		out[idx].Classification = resolved[i]
		if out[idx].Classification == nil {
			out[idx].Classification = []domain.ClassificationChange{}
		}
	}
	return &domain.VehicleTimeline{Items: out, Truncated: truncated}, nil
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
		   AND ($5::text = '' OR right(COALESCE(a.vin, ''), length($5)) = $5)
		   AND ($6::text = '' OR COALESCE(u.full_name, '') ILIKE '%' || $6 || '%'
		        OR COALESCE(u.email, '') ILIKE '%' || $6 || '%')
		   AND a.event_type IN (
		          'ISSUE_STATUS_CHANGE',
		          'ISSUE_CLASSIFICATION_CHANGE',
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
		        COALESCE(a.vin, ''),
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
		        COALESCE(cti.item_text, ''),
		        CASE WHEN a.event_type = 'ISSUE_CLASSIFICATION_CHANGE' THEN a.metadata END
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
	var parsed [][]parsedClassificationChange
	var classIdx []int
	for rows.Next() {
		var e domain.HomeActivityEntry
		var metaItemID *int
		var itemNo int
		var classMeta []byte
		if err := rows.Scan(
			&e.EventAt, &e.EventType, &e.VIN, &e.OldValue, &e.NewValue,
			&e.ActorName, &e.ActorEmail, &e.ChecklistType, &metaItemID,
			&itemNo, &e.ItemText, &classMeta,
		); err != nil {
			return nil, err
		}
		if itemNo > 0 {
			n := itemNo
			e.ItemNo = &n
		} else if metaItemID != nil {
			e.ItemNo = metaItemID
		}
		if e.EventType == string(domain.AuditEventIssueClassification) {
			// The stored summaries are internal (ids, process); readers get
			// the resolved Classification changes instead.
			e.OldValue, e.NewValue = "", ""
			parsed = append(parsed, parseClassificationMetadata(classMeta))
			classIdx = append(classIdx, len(out))
		}
		out = append(out, e)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	rows.Close()
	resolved, err := resolveClassificationChanges(ctx, r.pool, parsed)
	if err != nil {
		return nil, err
	}
	for i, idx := range classIdx {
		out[idx].Classification = resolved[i]
	}
	return &domain.AuditActivityPage{Items: out, Total: total}, nil
}
