package usecase

import (
	"context"
	"fmt"
	"strings"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/repository"
)

// defaultVINSearchLimit caps typeahead results when the caller does not
// specify a limit.
const defaultVINSearchLimit = 10

// defaultVehiclePageSize is the vehicle-list page size when unspecified.
const defaultVehiclePageSize = 20

// VehicleService serves vehicle reads (get, list, partial VIN search) and the
// hard-block-aware global status transition.
type VehicleService struct {
	vehicles  repository.VehicleRepository
	checklist repository.ChecklistProgressRepository
	audit     repository.AuditRepository
	uow       repository.TransactionManager
}

// NewVehicleService wires the usecase with its repositories.
func NewVehicleService(
	vehicles repository.VehicleRepository,
	checklist repository.ChecklistProgressRepository,
	audit repository.AuditRepository,
	uow repository.TransactionManager,
) *VehicleService {
	return &VehicleService{vehicles: vehicles, checklist: checklist, audit: audit, uow: uow}
}

// GetByVIN returns a single vehicle by exact VIN.
func (s *VehicleService) GetByVIN(ctx context.Context, vin string) (*domain.Vehicle, error) {
	return s.vehicles.GetByVIN(ctx, vin)
}

// VehicleListResult is a page of vehicles plus the total match count.
type VehicleListResult struct {
	Items []domain.Vehicle
	Total int
	Page  int
	Size  int
}

// List returns a filtered, paginated page of vehicles (web dashboard table).
func (s *VehicleService) List(ctx context.Context, f domain.VehicleListFilter, page int) (*VehicleListResult, error) {
	if page < 1 {
		page = 1
	}
	if f.Limit <= 0 || f.Limit > 100 {
		f.Limit = defaultVehiclePageSize
	}
	f.Offset = (page - 1) * f.Limit

	items, err := s.vehicles.List(ctx, f)
	if err != nil {
		return nil, err
	}
	total, err := s.vehicles.Count(ctx, f)
	if err != nil {
		return nil, err
	}
	return &VehicleListResult{Items: items, Total: total, Page: page, Size: f.Limit}, nil
}

// SearchByVINSuffix returns vehicles matching a partial VIN (typically the
// last 5 digits, FR-5.2). Matching is delegated to the repository's trigram
// index. An empty suffix yields no results rather than the whole table.
func (s *VehicleService) SearchByVINSuffix(ctx context.Context, suffix string, limit int) ([]domain.Vehicle, error) {
	suffix = strings.ToUpper(strings.TrimSpace(suffix))
	if suffix == "" {
		return []domain.Vehicle{}, nil
	}
	if limit <= 0 || limit > 50 {
		limit = defaultVINSearchLimit
	}
	return s.vehicles.SearchByVINSuffix(ctx, suffix, limit)
}

// ChangeStatus is no longer used for free status edits. Vehicle status advances
// only through EOL workflow actions; managers park/restore via PlaceOnHold /
// ReleaseFromHold. Kept as a hard reject so stale clients get a clear error.
func (s *VehicleService) ChangeStatus(ctx context.Context, vin string, target domain.VehicleStatus, actorID int) (*domain.Vehicle, error) {
	_ = ctx
	_ = vin
	_ = target
	_ = actorID
	return nil, fmt.Errorf("%w: vehicle status changes only via EoL workflow or hold actions", domain.ErrInvalidStatusTransition)
}

// PlaceOnHold parks an in-progress vehicle on ON_HOLD with a required reason.
func (s *VehicleService) PlaceOnHold(ctx context.Context, vin string, reason string, actorID int) (*domain.Vehicle, error) {
	reason = strings.TrimSpace(reason)
	if reason == "" {
		return nil, domain.ErrHoldReasonRequired
	}
	vehicle, err := s.vehicles.GetByVIN(ctx, vin)
	if err != nil {
		return nil, err
	}
	previous := vehicle.CurrentGlobalStatus
	switch previous {
	case domain.VehicleStatusInProduction, domain.VehicleStatusInWarehouse:
		// ok
	default:
		return nil, domain.ErrCannotHold
	}

	performedBy := actorID
	err = s.uow.WithinTx(ctx, func(txCtx context.Context) error {
		if err := s.vehicles.PlaceOnHold(txCtx, vin, reason); err != nil {
			return err
		}
		return s.audit.Append(txCtx, domain.AuditLog{
			VIN:         vin,
			EventType:   domain.AuditEventStatusChange,
			OldValue:    string(previous),
			NewValue:    string(domain.VehicleStatusOnHold),
			PerformedBy: &performedBy,
			Metadata: map[string]any{
				"hold_reason": reason,
				"action":      "place_on_hold",
			},
		})
	})
	if err != nil {
		return nil, err
	}
	return s.vehicles.GetByVIN(ctx, vin)
}

// ReleaseFromHold restores the status captured when the vehicle entered hold.
func (s *VehicleService) ReleaseFromHold(ctx context.Context, vin string, actorID int) (*domain.Vehicle, error) {
	vehicle, err := s.vehicles.GetByVIN(ctx, vin)
	if err != nil {
		return nil, err
	}
	if vehicle.CurrentGlobalStatus != domain.VehicleStatusOnHold {
		return nil, domain.ErrNotOnHold
	}
	restore := domain.VehicleStatusInProduction
	if vehicle.StatusBeforeHold != nil {
		restore = *vehicle.StatusBeforeHold
	}

	performedBy := actorID
	err = s.uow.WithinTx(ctx, func(txCtx context.Context) error {
		if err := s.vehicles.ReleaseFromHold(txCtx, vin); err != nil {
			return err
		}
		return s.audit.Append(txCtx, domain.AuditLog{
			VIN:         vin,
			EventType:   domain.AuditEventStatusChange,
			OldValue:    string(domain.VehicleStatusOnHold),
			NewValue:    string(restore),
			PerformedBy: &performedBy,
			Metadata: map[string]any{
				"action": "release_from_hold",
			},
		})
	})
	if err != nil {
		return nil, err
	}
	return s.vehicles.GetByVIN(ctx, vin)
}

// ListStatusHistory returns chronological STATUS_CHANGE events for the VIN.
// A missing vehicle 404s so callers do not see an empty trail for a bogus VIN.
func (s *VehicleService) ListStatusHistory(ctx context.Context, vin string) ([]domain.VehicleStatusHistoryEntry, error) {
	if _, err := s.vehicles.GetByVIN(ctx, vin); err != nil {
		return nil, err
	}
	if s.audit == nil {
		return []domain.VehicleStatusHistoryEntry{}, nil
	}
	items, err := s.audit.ListVehicleStatusHistory(ctx, vin)
	if err != nil {
		return nil, err
	}
	if items == nil {
		return []domain.VehicleStatusHistoryEntry{}, nil
	}
	return items, nil
}

const maxBulkImportVINs = 500

// VehicleBulkImportResult is the outcome of a PLANNED VIN bulk insert.
type VehicleBulkImportResult struct {
	Created []string
	Skipped []string
	Invalid []string
}

func normalizeVIN(raw string) (string, bool) {
	vin := strings.ToUpper(strings.TrimSpace(raw))
	if len(vin) != 17 {
		return "", false
	}
	for _, c := range vin {
		if (c < 'A' || c > 'Z') && (c < '0' || c > '9') {
			return "", false
		}
	}
	return vin, true
}

// BulkImportPlanned inserts VINs as PLANNED (Karar 10). Duplicates in the
// payload are collapsed; VINs that already exist are skipped; malformed
// values are listed in Invalid and are not inserted.
func (s *VehicleService) BulkImportPlanned(ctx context.Context, raw []string) (*VehicleBulkImportResult, error) {
	if len(raw) > maxBulkImportVINs {
		raw = raw[:maxBulkImportVINs]
	}
	out := &VehicleBulkImportResult{
		Created: []string{},
		Skipped: []string{},
		Invalid: []string{},
	}
	seen := make(map[string]struct{}, len(raw))
	var candidates []string
	for _, item := range raw {
		vin, ok := normalizeVIN(item)
		if !ok {
			if strings.TrimSpace(item) != "" {
				out.Invalid = append(out.Invalid, strings.TrimSpace(item))
			}
			continue
		}
		if _, dup := seen[vin]; dup {
			continue
		}
		seen[vin] = struct{}{}
		candidates = append(candidates, vin)
	}
	if len(candidates) == 0 {
		return out, nil
	}

	created, err := s.vehicles.BulkInsertPlanned(ctx, candidates)
	if err != nil {
		return nil, err
	}
	createdSet := make(map[string]struct{}, len(created))
	for _, vin := range created {
		createdSet[vin] = struct{}{}
	}
	out.Created = created
	if out.Created == nil {
		out.Created = []string{}
	}
	for _, vin := range candidates {
		if _, ok := createdSet[vin]; !ok {
			out.Skipped = append(out.Skipped, vin)
		}
	}
	return out, nil
}
