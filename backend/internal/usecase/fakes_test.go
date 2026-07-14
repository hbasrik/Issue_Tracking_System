package usecase_test

import (
	"context"
	"errors"

	"github.com/karea/backend/internal/domain"
)

// passthroughFakeUoW runs fn without transactional semantics (for tests that
// only care about successful paths).
type passthroughFakeUoW struct{}

func (p *passthroughFakeUoW) WithinTx(ctx context.Context, fn func(context.Context) error) error {
	return fn(ctx)
}

// snapshotFakeUoW simulates database transaction commit/rollback for in-memory
// fakes: if fn returns an error, all mutations made during fn are reverted.
type snapshotFakeUoW struct {
	vehicles *fakeVehicleRepo
	issues   *fakeIssueRepo
	audit    *fakeAuditRepo
}

func (s *snapshotFakeUoW) WithinTx(ctx context.Context, fn func(context.Context) error) error {
	var vSnap vehicleSnapshot
	var iSnap issueSnapshot
	var aSnap auditSnapshot
	if s.vehicles != nil {
		vSnap = s.vehicles.snapshot()
	}
	if s.issues != nil {
		iSnap = s.issues.snapshot()
	}
	if s.audit != nil {
		aSnap = s.audit.snapshot()
	}
	if err := fn(ctx); err != nil {
		if s.vehicles != nil {
			s.vehicles.restore(vSnap)
		}
		if s.issues != nil {
			s.issues.restore(iSnap)
		}
		if s.audit != nil {
			s.audit.restore(aSnap)
		}
		return err
	}
	return nil
}

// fakeVehicleRepo is an in-memory VehicleRepository for unit tests. It records
// status/progress updates so tests can assert whether a transition was
// attempted.
type fakeVehicleRepo struct {
	vehicles       map[string]*domain.Vehicle
	statusUpdates  []statusUpdate
	progressUpdate *progressUpdate
}

type vehicleSnapshot map[string]domain.Vehicle

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

func (f *fakeVehicleRepo) snapshot() vehicleSnapshot {
	snap := make(vehicleSnapshot, len(f.vehicles))
	for vin, v := range f.vehicles {
		snap[vin] = *v
	}
	return snap
}

func (f *fakeVehicleRepo) restore(snap vehicleSnapshot) {
	f.vehicles = make(map[string]*domain.Vehicle, len(snap))
	for vin, v := range snap {
		copied := v
		f.vehicles[vin] = &copied
	}
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
	v, ok := f.vehicles[vin]
	if !ok {
		return domain.ErrNotFound
	}
	v.CurrentGlobalStatus = status
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

func (f *fakeCheckpointRepo) ListCatalogueWithProgress(_ context.Context, _ string) ([]domain.CheckpointItemView, error) {
	return nil, nil
}

func (f *fakeCheckpointRepo) CountOpenIssuesByPhase(_ context.Context, _ string) (map[int16]int, error) {
	return map[int16]int{}, nil
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

func (f *fakeChecklistRepo) ResolveDefaultTemplateID(_ context.Context, _ domain.ChecklistType) (int, error) {
	return 1, nil
}

func (f *fakeChecklistRepo) ListItemsWithProgress(_ context.Context, _ string, _ domain.ChecklistType, _ int) ([]domain.ChecklistItemView, error) {
	return nil, nil
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

// fakeIssueRepo is an in-memory IssueRepository keyed by issue id.
type fakeIssueRepo struct {
	issues map[int64]*domain.Issue
	nextID int64
}

type issueSnapshot map[int64]domain.Issue

func newFakeIssueRepo() *fakeIssueRepo {
	return &fakeIssueRepo{issues: map[int64]*domain.Issue{}, nextID: 1}
}

func (f *fakeIssueRepo) snapshot() issueSnapshot {
	snap := make(issueSnapshot, len(f.issues))
	for id, issue := range f.issues {
		snap[id] = *issue
	}
	return snap
}

func (f *fakeIssueRepo) restore(snap issueSnapshot) {
	f.issues = make(map[int64]*domain.Issue, len(snap))
	for id, issue := range snap {
		copied := issue
		f.issues[id] = &copied
	}
}

func (f *fakeIssueRepo) Create(_ context.Context, issue *domain.Issue) (int64, error) {
	id := f.nextID
	f.nextID++
	stored := *issue
	stored.ID = id
	f.issues[id] = &stored
	return id, nil
}

func (f *fakeIssueRepo) GetByID(_ context.Context, id int64) (*domain.Issue, error) {
	issue, ok := f.issues[id]
	if !ok {
		return nil, domain.ErrNotFound
	}
	return issue, nil
}

func (f *fakeIssueRepo) ListForUser(_ context.Context, userID int, status *domain.IssueStatus) ([]domain.Issue, error) {
	var out []domain.Issue
	for _, issue := range f.issues {
		if issue.IssueReporterID != userID &&
			(issue.ProcessReporterID == nil || *issue.ProcessReporterID != userID) &&
			(issue.FinishReporterID == nil || *issue.FinishReporterID != userID) {
			continue
		}
		if status != nil && issue.Status != *status {
			continue
		}
		out = append(out, *issue)
	}
	return out, nil
}

func (f *fakeIssueRepo) UpdateStatus(_ context.Context, id int64, status domain.IssueStatus, _ int) error {
	issue, ok := f.issues[id]
	if !ok {
		return domain.ErrNotFound
	}
	issue.Status = status
	return nil
}

// fakeAuditRepo is an in-memory AuditRepository that records appended entries so
// tests can assert what was written (e.g. that performed_by is populated).
type fakeAuditRepo struct {
	entries   []domain.AuditLog
	appendErr error
}

type auditSnapshot struct {
	entries []domain.AuditLog
}

func newFakeAuditRepo() *fakeAuditRepo {
	return &fakeAuditRepo{}
}

func (f *fakeAuditRepo) snapshot() auditSnapshot {
	copied := make([]domain.AuditLog, len(f.entries))
	copy(copied, f.entries)
	return auditSnapshot{entries: copied}
}

func (f *fakeAuditRepo) restore(snap auditSnapshot) {
	f.entries = snap.entries
}

func (f *fakeAuditRepo) Append(_ context.Context, entry domain.AuditLog) error {
	if f.appendErr != nil {
		return f.appendErr
	}
	f.entries = append(f.entries, entry)
	return nil
}

var errAuditInsertFailed = errors.New("audit insert failed")
