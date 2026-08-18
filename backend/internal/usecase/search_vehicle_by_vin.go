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

// ChangeStatus performs a manual (Manager/Admin) global status transition,
// enforcing the shipment hard-block gate independently of the database trigger
// (defense in depth, FR-4.3). Moving a vehicle to WITH_CUSTOMER or SHIPPED is
// rejected with a *domain.GateBlockedError when any shipment checklist item is
// not OK/CONDITIONAL_OK. On success it records a STATUS_CHANGE audit entry
// attributed to actorID so the change is traceable to the acting user (FR-1.2).
func (s *VehicleService) ChangeStatus(ctx context.Context, vin string, target domain.VehicleStatus, actorID int) (*domain.Vehicle, error) {
	if !target.Valid() {
		return nil, domain.ErrInvalidEnumValue
	}

	vehicle, err := s.vehicles.GetByVIN(ctx, vin)
	if err != nil {
		return nil, err
	}
	previousStatus := vehicle.CurrentGlobalStatus

	shipmentGateOpen := true
	if target == domain.VehicleStatusWithCustomer || target == domain.VehicleStatusShipped {
		items, err := s.checklist.ListByVINAndType(ctx, vin, domain.ChecklistTypeShipment)
		if err != nil {
			return nil, err
		}
		open, blocking := EvaluateChecklistGate(items)
		if !open {
			return nil, &domain.GateBlockedError{
				ChecklistType:   domain.ChecklistTypeShipment,
				BlockingItemIDs: blocking,
			}
		}
		shipmentGateOpen = open
	}

	if err := AuthorizeStatusTransition(target, shipmentGateOpen); err != nil {
		return nil, err
	}

	performedBy := actorID
	err = s.uow.WithinTx(ctx, func(txCtx context.Context) error {
		if err := s.vehicles.UpdateStatus(txCtx, vin, target); err != nil {
			return err
		}
		return s.audit.Append(txCtx, domain.AuditLog{
			VIN:         vin,
			EventType:   domain.AuditEventStatusChange,
			OldValue:    string(previousStatus),
			NewValue:    string(target),
			PerformedBy: &performedBy,
		})
	})
	if err != nil {
		return nil, err
	}
	vehicle.CurrentGlobalStatus = target
	return vehicle, nil
}
