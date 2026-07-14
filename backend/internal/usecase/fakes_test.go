package usecase_test

import (
	"context"

	"github.com/karea/backend/internal/domain"
)

// fakeVehicleRepo is an in-memory VehicleRepository for unit tests. It records
// status/progress updates so tests can assert whether a transition was
// attempted.
type fakeVehicleRepo struct {
	vehicles       map[string]*domain.Vehicle
	statusUpdates  []statusUpdate
	progressUpdate *progressUpdate
}

type statusUpdate struct {
	vin    string
	status domain.VehicleStatus
}

type progressUpdate struct {
	vin        string
	percentage float64
	phase      int16
}

func newFakeVehicleRepo() *fakeVehicleRepo {
	return &fakeVehicleRepo{vehicles: map[string]*domain.Vehicle{}}
}

func (f *fakeVehicleRepo) GetByVIN(_ context.Context, vin string) (*domain.Vehicle, error) {
	v, ok := f.vehicles[vin]
	if !ok {
		return nil, domain.ErrNotFound
	}
	return v, nil
}

func (f *fakeVehicleRepo) List(_ context.Context, _ domain.VehicleListFilter) ([]domain.Vehicle, error) {
	var out []domain.Vehicle
	for _, v := range f.vehicles {
		out = append(out, *v)
	}
	return out, nil
}

func (f *fakeVehicleRepo) Count(_ context.Context, _ domain.VehicleListFilter) (int, error) {
	return len(f.vehicles), nil
}

func (f *fakeVehicleRepo) SearchByVINSuffix(_ context.Context, suffix string, limit int) ([]domain.Vehicle, error) {
	var out []domain.Vehicle
	for _, v := range f.vehicles {
		if len(out) >= limit {
			break
		}
		out = append(out, *v)
		_ = suffix
	}
	return out, nil
}

func (f *fakeVehicleRepo) UpdateProgress(_ context.Context, vin string, percentage float64, phase int16) error {
	f.progressUpdate = &progressUpdate{vin: vin, percentage: percentage, phase: phase}
	return nil
}

func (f *fakeVehicleRepo) UpdateStatus(_ context.Context, vin string, status domain.VehicleStatus) error {
	f.statusUpdates = append(f.statusUpdates, statusUpdate{vin: vin, status: status})
	return nil
}

// fakeCheckpointRepo is an in-memory CheckpointProgressRepository keyed by
// (vin, checkpointID).
type fakeCheckpointRepo struct {
	rows map[string][]domain.PhaseCheckpointProgress
}

func newFakeCheckpointRepo() *fakeCheckpointRepo {
	return &fakeCheckpointRepo{rows: map[string][]domain.PhaseCheckpointProgress{}}
}

func (f *fakeCheckpointRepo) ListByVIN(_ context.Context, vin string) ([]domain.PhaseCheckpointProgress, error) {
	return f.rows[vin], nil
}

func (f *fakeCheckpointRepo) SaveResult(_ context.Context, vin string, checkpointID int, status domain.CheckpointStatus, checkedBy int) error {
	rows := f.rows[vin]
	for i := range rows {
		if rows[i].CheckpointID == checkpointID {
			rows[i].Status = status
			rows[i].CheckedBy = &checkedBy
			f.rows[vin] = rows
			return nil
		}
	}
	return domain.ErrNotFound
}

// fakeChecklistRepo is an in-memory ChecklistProgressRepository keyed by vin.
type fakeChecklistRepo struct {
	rows map[string][]domain.ChecklistProgress
}

func newFakeChecklistRepo() *fakeChecklistRepo {
	return &fakeChecklistRepo{rows: map[string][]domain.ChecklistProgress{}}
}

func (f *fakeChecklistRepo) ListByVINAndType(_ context.Context, vin string, t domain.ChecklistType) ([]domain.ChecklistProgress, error) {
	var out []domain.ChecklistProgress
	for _, r := range f.rows[vin] {
		if r.ChecklistType == t {
			out = append(out, r)
		}
	}
	return out, nil
}

func (f *fakeChecklistRepo) SaveResult(_ context.Context, result domain.ChecklistProgress) error {
	rows := f.rows[result.VIN]
	for i := range rows {
		if rows[i].CheckItemID == result.CheckItemID && rows[i].ChecklistType == result.ChecklistType {
			rows[i].CheckStatus = result.CheckStatus
			rows[i].ReworkDesc = result.ReworkDesc
			rows[i].ConditionalDesc = result.ConditionalDesc
			rows[i].RejectedDesc = result.RejectedDesc
			f.rows[result.VIN] = rows
			return nil
		}
	}
	return domain.ErrNotFound
}
