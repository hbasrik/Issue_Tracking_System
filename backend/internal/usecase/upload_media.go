package usecase

import (
	"context"
	"io"
	"path/filepath"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/repository"
)

// MediaStore persists the bytes of an upload and reports where they landed.
// The returned path is opaque to the rest of the application, which is what
// lets the local-disk backend be swapped for cloud storage later (Karar 8).
type MediaStore interface {
	Save(ctx context.Context, entityType domain.MediaEntityType, entityID, fileName string, content io.Reader) (storagePath string, size int64, err error)
}

// MediaUploader attaches files to vehicles, issues and checklist/station-step
// progress rows.
type MediaUploader struct {
	media repository.MediaRepository
	store MediaStore
}

// NewMediaUploader wires the usecase with its repository and storage backend.
func NewMediaUploader(media repository.MediaRepository, store MediaStore) *MediaUploader {
	return &MediaUploader{media: media, store: store}
}

// UploadMediaInput is the request to attach one file to one entity.
type UploadMediaInput struct {
	EntityType domain.MediaEntityType
	EntityID   string
	FileName   string
	MimeType   string
	Content    io.Reader
	UploadedBy int
}

// Upload validates the target entity, stores the file and records the
// attachment.
//
// media_attachments is polymorphic on entity_id, so the database cannot reject
// a row that points at a vehicle or issue which does not exist. VINForEntity
// below is that missing check (and supplies the denormalized vin, Karar 11).
// It runs before the file is written so a rejected upload leaves nothing on disk.
func (u *MediaUploader) Upload(ctx context.Context, in UploadMediaInput) (*domain.MediaAttachment, error) {
	if err := in.EntityType.ValidateEntityID(in.EntityID); err != nil {
		return nil, err
	}
	if in.FileName == "" || in.Content == nil {
		return nil, domain.ErrInvalidEnumValue
	}

	vin, err := u.media.VINForEntity(ctx, in.EntityType, in.EntityID)
	if err != nil {
		return nil, err
	}

	// Keep only the base name: the client's path is not ours to reproduce.
	fileName := filepath.Base(in.FileName)

	storagePath, size, err := u.store.Save(ctx, in.EntityType, in.EntityID, fileName, in.Content)
	if err != nil {
		return nil, err
	}

	uploadedBy := in.UploadedBy
	attachment := &domain.MediaAttachment{
		EntityType:  in.EntityType,
		EntityID:    in.EntityID,
		VIN:         vin,
		FileName:    fileName,
		StoragePath: storagePath,
		MimeType:    in.MimeType,
		FileSize:    size,
		UploadedBy:  &uploadedBy,
	}

	id, err := u.media.Create(ctx, attachment)
	if err != nil {
		return nil, err
	}
	attachment.ID = id
	return attachment, nil
}

// ListForEntity returns an entity's attachments for the Vehicle Detail and
// Issue Detail screens. An entity with nothing attached yields an empty slice
// rather than an error, so the UI renders an empty gallery instead of a
// failure.
func (u *MediaUploader) ListForEntity(ctx context.Context, entityType domain.MediaEntityType, entityID string) ([]domain.MediaAttachment, error) {
	if err := entityType.ValidateEntityID(entityID); err != nil {
		return nil, err
	}

	attachments, err := u.media.ListForEntity(ctx, entityType, entityID)
	if err != nil {
		return nil, err
	}
	if attachments == nil {
		return []domain.MediaAttachment{}, nil
	}
	return attachments, nil
}

// ListByVIN returns every attachment for one vehicle (Karar 11). A VIN that
// does not exist is ErrNotFound; a known vehicle with no photos is an empty
// slice so Vehicle Detail can render an empty gallery.
func (u *MediaUploader) ListByVIN(ctx context.Context, vin string) ([]domain.MediaAttachment, error) {
	if err := domain.MediaEntityVehicle.ValidateEntityID(vin); err != nil {
		return nil, err
	}
	if _, err := u.media.VINForEntity(ctx, domain.MediaEntityVehicle, vin); err != nil {
		return nil, err
	}

	attachments, err := u.media.ListByVIN(ctx, vin)
	if err != nil {
		return nil, err
	}
	if attachments == nil {
		return []domain.MediaAttachment{}, nil
	}
	return attachments, nil
}
