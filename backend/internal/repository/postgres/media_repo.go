package postgres

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/repository"
)

// MediaRepo is the Postgres-backed MediaRepository.
type MediaRepo struct {
	pool *pgxpool.Pool
}

// NewMediaRepo constructs a MediaRepo.
func NewMediaRepo(pool *pgxpool.Pool) *MediaRepo {
	return &MediaRepo{pool: pool}
}

var _ repository.MediaRepository = (*MediaRepo)(nil)

const mediaColumns = `id, entity_type, entity_id, file_name, storage_path,
	COALESCE(mime_type, ''), COALESCE(file_size, 0), uploaded_by, uploaded_at`

// entityExistsQueries maps each attachable entity to the lookup that proves it
// exists. Keeping them in one table makes it obvious that adding an entity
// type without adding its check would silently disable the integrity guard.
var entityExistsQueries = map[domain.MediaEntityType]string{
	domain.MediaEntityVehicle:               `SELECT EXISTS (SELECT 1 FROM vehicles WHERE vin = $1)`,
	domain.MediaEntityIssue:                 `SELECT EXISTS (SELECT 1 FROM issue_list WHERE id = $1::bigint)`,
	domain.MediaEntityIssueResolution:       `SELECT EXISTS (SELECT 1 FROM issue_list WHERE id = $1::bigint)`,
	domain.MediaEntityChecklistItemProgress: `SELECT EXISTS (SELECT 1 FROM checklist_item_progress WHERE id = $1::bigint)`,
	domain.MediaEntityStationStepProgress:   `SELECT EXISTS (SELECT 1 FROM vehicle_station_step_progress WHERE id = $1::bigint)`,
}

// Create inserts an attachment and returns its generated ID.
func (r *MediaRepo) Create(ctx context.Context, attachment *domain.MediaAttachment) (int64, error) {
	var id int64
	err := executor(ctx, r.pool).QueryRow(ctx,
		`INSERT INTO media_attachments
		    (entity_type, entity_id, file_name, storage_path, mime_type, file_size, uploaded_by)
		 VALUES ($1, $2, $3, $4, NULLIF($5, ''), $6, $7)
		 RETURNING id`,
		string(attachment.EntityType), attachment.EntityID, attachment.FileName,
		attachment.StoragePath, attachment.MimeType, attachment.FileSize,
		attachment.UploadedBy,
	).Scan(&id)
	return id, err
}

// ListForEntity returns every attachment for one entity, newest first.
func (r *MediaRepo) ListForEntity(ctx context.Context, entityType domain.MediaEntityType, entityID string) ([]domain.MediaAttachment, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT `+mediaColumns+`
		 FROM media_attachments
		 WHERE entity_type = $1 AND entity_id = $2
		 ORDER BY uploaded_at DESC, id DESC`,
		string(entityType), entityID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []domain.MediaAttachment{}
	for rows.Next() {
		var m domain.MediaAttachment
		var entity string
		if err := rows.Scan(
			&m.ID, &entity, &m.EntityID, &m.FileName, &m.StoragePath,
			&m.MimeType, &m.FileSize, &m.UploadedBy, &m.UploadedAt,
		); err != nil {
			return nil, err
		}
		m.EntityType = domain.MediaEntityType(entity)
		out = append(out, m)
	}
	return out, rows.Err()
}

// EntityExists reports whether the referenced row exists. Callers must have
// validated the id's shape first (see MediaEntityType.ValidateEntityID), since
// the numeric casts here would otherwise fail on a non-numeric id.
func (r *MediaRepo) EntityExists(ctx context.Context, entityType domain.MediaEntityType, entityID string) (bool, error) {
	query, ok := entityExistsQueries[entityType]
	if !ok {
		return false, fmt.Errorf("%w: media entity type %q", domain.ErrInvalidEnumValue, entityType)
	}

	var exists bool
	if err := executor(ctx, r.pool).QueryRow(ctx, query, entityID).Scan(&exists); err != nil {
		return false, err
	}
	return exists, nil
}
