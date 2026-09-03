package usecase

import (
	"context"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/repository"
)

// ActivityReader serves the plant-wide Hareketler (audit activity) page.
type ActivityReader struct {
	audit repository.AuditRepository
}

// NewActivityReader wires the activity list reader.
func NewActivityReader(audit repository.AuditRepository) *ActivityReader {
	return &ActivityReader{audit: audit}
}

// List returns one filtered page of audit activity.
func (r *ActivityReader) List(ctx context.Context, f domain.AuditActivityFilter) (*domain.AuditActivityPage, error) {
	page, err := r.audit.ListActivity(ctx, f)
	if err != nil {
		return nil, err
	}
	if page.Items == nil {
		page.Items = []domain.HomeActivityEntry{}
	}
	return page, nil
}
