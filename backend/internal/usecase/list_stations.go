package usecase

import (
	"context"
	"strconv"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/repository"
)

// StationService lists the station catalogue.
type StationService struct {
	stations repository.StationRepository
}

// NewStationService wires the usecase with its repository.
func NewStationService(stations repository.StationRepository) *StationService {
	return &StationService{stations: stations}
}

// List returns all stations.
func (s *StationService) List(ctx context.Context) ([]domain.Station, error) {
	return s.stations.List(ctx)
}

// formatPhaseKey converts a phase number to the string key used in
// open_issues_by_phase JSON responses.
func formatPhaseKey(phase int16) string {
	return strconv.Itoa(int(phase))
}
