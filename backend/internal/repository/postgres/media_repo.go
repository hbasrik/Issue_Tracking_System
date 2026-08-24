package postgres

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
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

const mediaColumns = `id, entity_type, entity_id, vin, file_name, storage_path,
	COALESCE(mime_type, ''), COALESCE(file_size, 0), uploaded_by, uploaded_at`

// entityVINQueries maps each attachable entity to the lookup that returns its
// vehicle VIN (and thereby proves the row exists). One query covers both the
// polymorphic existence check and the Karar 11 vin write.
var entityVINQueries = map[domain.MediaEntityType]string{
	domain.MediaEntityVehicle:               `SELECT vin FROM vehicles WHERE vin = $1`,
	domain.MediaEntityIssue:                 `SELECT vin FROM issue_list WHERE id = $1::bigint`,
	domain.MediaEntityIssueResolution:       `SELECT vin FROM issue_list WHERE id = $1::bigint`,
	domain.MediaEntityChecklistItemProgress: `SELECT vin FROM checklist_item_progress WHERE id = $1::bigint`,
	domain.MediaEntityStationStepProgress:   `SELECT vin FROM vehicle_station_step_progress WHERE id = $1::bigint`,
}

// Create inserts an attachment and returns its generated ID.
func (r *MediaRepo) Create(ctx context.Context, attachment *domain.MediaAttachment) (int64, error) {
	var id int64
	err := executor(ctx, r.pool).QueryRow(ctx,
		`INSERT INTO media_attachments
		    (entity_type, entity_id, vin, file_name, storage_path, mime_type, file_size, uploaded_by)
		 VALUES ($1, $2, $3, $4, $5, NULLIF($6, ''), $7, $8)
		 RETURNING id`,
		string(attachment.EntityType), attachment.EntityID, attachment.VIN,
		attachment.FileName, attachment.StoragePath, attachment.MimeType,
		attachment.FileSize, attachment.UploadedBy,
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
	return scanMediaRows(rows)
}

// ListByVIN returns every attachment for one vehicle, newest first.
func (r *MediaRepo) ListByVIN(ctx context.Context, vin string) ([]domain.MediaAttachment, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT `+mediaColumns+`
		 FROM media_attachments
		 WHERE vin = $1
		 ORDER BY uploaded_at DESC, id DESC`,
		vin)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanMediaRows(rows)
}

func scanMediaRows(rows pgx.Rows) ([]domain.MediaAttachment, error) {
	out := []domain.MediaAttachment{}
	for rows.Next() {
		m, err := scanMediaAttachment(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func scanMediaAttachment(row pgx.Row) (domain.MediaAttachment, error) {
	var m domain.MediaAttachment
	var entity string
	if err := row.Scan(
		&m.ID, &entity, &m.EntityID, &m.VIN, &m.FileName, &m.StoragePath,
		&m.MimeType, &m.FileSize, &m.UploadedBy, &m.UploadedAt,
	); err != nil {
		return domain.MediaAttachment{}, err
	}
	m.EntityType = domain.MediaEntityType(entity)
	return m, nil
}

// VINForEntity returns the vehicle VIN for the attachable entity. Callers must
// have validated the id's shape first (see MediaEntityType.ValidateEntityID),
// since the numeric casts here would otherwise fail on a non-numeric id.
func (r *MediaRepo) VINForEntity(ctx context.Context, entityType domain.MediaEntityType, entityID string) (string, error) {
	query, ok := entityVINQueries[entityType]
	if !ok {
		return "", fmt.Errorf("%w: media entity type %q", domain.ErrInvalidEnumValue, entityType)
	}

	var vin string
	err := executor(ctx, r.pool).QueryRow(ctx, query, entityID).Scan(&vin)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", domain.ErrNotFound
	}
	if err != nil {
		return "", err
	}
	return vin, nil
}
