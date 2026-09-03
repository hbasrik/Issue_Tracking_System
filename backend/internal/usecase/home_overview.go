package usecase

import (
	"context"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/repository"
)

const homeActivityLimit = 8
const homeCriticalLimit = 8

// HomeOverviewReader serves the web home dashboard slices that are not
// derived from the issue list.
type HomeOverviewReader struct {
	home  repository.HomeRepository
	audit repository.AuditRepository
}

// NewHomeOverviewReader wires the dashboard reader.
func NewHomeOverviewReader(home repository.HomeRepository, audit repository.AuditRepository) *HomeOverviewReader {
	return &HomeOverviewReader{home: home, audit: audit}
}

// Overview returns EOL funnel, checklist completion, critical VINs, and
// recent audit activity in one payload.
func (h *HomeOverviewReader) Overview(ctx context.Context) (*domain.HomeOverview, error) {
	stages, err := h.home.EOLStageCounts(ctx)
	if err != nil {
		return nil, err
	}
	checklist, err := h.home.EOLChecklistCounts(ctx)
	if err != nil {
		return nil, err
	}
	critical, err := h.home.CriticalVehicles(ctx, homeCriticalLimit)
	if err != nil {
		return nil, err
	}
	activity, err := h.audit.ListRecent(ctx, homeActivityLimit)
	if err != nil {
		return nil, err
	}
	if stages == nil {
		stages = []domain.HomeEOLStageCount{}
	}
	if checklist == nil {
		checklist = []domain.HomeEOLChecklistCount{}
	}
	if critical == nil {
		critical = []domain.HomeCriticalVehicle{}
	}
	if activity == nil {
		activity = []domain.HomeActivityEntry{}
	}
	return &domain.HomeOverview{
		EOLStages:        stages,
		EOLChecklist:     checklist,
		CriticalVehicles: critical,
		Activity:         activity,
	}, nil
}
