package usecase

import (
	"context"
	"strings"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/repository"
)

// defaultVINSearchLimit caps typeahead results when the caller does not
// specify a limit.
const defaultVINSearchLimit = 10

// VehicleSearcher performs partial VIN (chassis number) lookups.
type VehicleSearcher struct {
	vehicles repository.VehicleRepository
}

// NewVehicleSearcher wires the usecase with its repository.
func NewVehicleSearcher(vehicles repository.VehicleRepository) *VehicleSearcher {
	return &VehicleSearcher{vehicles: vehicles}
}

// SearchByVINSuffix returns vehicles matching a partial VIN (typically the
// last 5 digits, FR-5.2). Matching is delegated to the repository's trigram
// index. An empty suffix yields no results rather than the whole table.
func (s *VehicleSearcher) SearchByVINSuffix(ctx context.Context, suffix string, limit int) ([]domain.Vehicle, error) {
	suffix = strings.ToUpper(strings.TrimSpace(suffix))
	if suffix == "" {
		return []domain.Vehicle{}, nil
	}
	if limit <= 0 || limit > 50 {
		limit = defaultVINSearchLimit
	}
	return s.vehicles.SearchByVINSuffix(ctx, suffix, limit)
}
