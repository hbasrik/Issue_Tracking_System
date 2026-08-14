package usecase_test

import (
	"context"
	"errors"
	"io"
	"sort"
	"strings"
	"time"

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
	stationID  *int
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

func (f *fakeVehicleRepo) GetByVehicleNumber(_ context.Context, vehicleNumber string) (*domain.Vehicle, error) {
	for _, v := range f.vehicles {
		if v.VehicleNumber == vehicleNumber {
			return v, nil
		}
	}
	return nil, domain.ErrNotFound
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

func (f *fakeVehicleRepo) UpdateProgress(_ context.Context, vin string, percentage float64, stationID *int) error {
	f.progressUpdate = &progressUpdate{vin: vin, percentage: percentage, stationID: stationID}
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

// fakeStationStepRepo is an in-memory StationStepProgressRepository keyed by
// (vin, stationStepID).
type fakeStationStepRepo struct {
	rows map[string][]domain.VehicleStationStepProgress
}

func newFakeStationStepRepo() *fakeStationStepRepo {
	return &fakeStationStepRepo{rows: map[string][]domain.VehicleStationStepProgress{}}
}

func (f *fakeStationStepRepo) ListByVIN(_ context.Context, vin string) ([]domain.VehicleStationStepProgress, error) {
	return f.rows[vin], nil
}

func (f *fakeStationStepRepo) ListCatalogueWithProgress(_ context.Context, _ string) ([]domain.StationStepItemView, error) {
	return nil, nil
}

func (f *fakeStationStepRepo) CountOpenIssuesByStation(_ context.Context, _ string) (map[int]int, error) {
	return map[int]int{}, nil
}

func (f *fakeStationStepRepo) SaveResult(_ context.Context, vin string, stationStepID int, status domain.StationStepStatus, checkedBy int) error {
	rows := f.rows[vin]
	for i := range rows {
		if rows[i].StationStepID == stationStepID {
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

func (f *fakeIssueRepo) ListOpenByVIN(_ context.Context, vin string) ([]domain.Issue, error) {
	var out []domain.Issue
	for _, issue := range f.issues {
		if issue.VIN == vin && issue.Status.IsOpen() {
			out = append(out, *issue)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out, nil
}

// UpdateStatus mirrors the real repository: each target status stamps its own
// lifecycle reporter/date pair, so tests can assert that a conditional
// sign-off writes the conditional columns rather than the approval ones.
func (f *fakeIssueRepo) UpdateStatus(_ context.Context, id int64, status domain.IssueStatus, actorID int) error {
	issue, ok := f.issues[id]
	if !ok {
		return domain.ErrNotFound
	}
	now := time.Now()
	switch status {
	case domain.IssueStatusInProgress:
		issue.ProcessReporterID, issue.ProcessDate = &actorID, &now
	case domain.IssueStatusDone:
		issue.FinishReporterID, issue.FinishDate = &actorID, &now
	case domain.IssueStatusApproved:
		issue.ApproveReporterID, issue.ApproveDate = &actorID, &now
	case domain.IssueStatusConditionalApproved:
		issue.ConditionalApproveReporterID, issue.ConditionalApproveDate = &actorID, &now
	default:
		return domain.ErrInvalidStatusTransition
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

// fakeEOLWorkflowRepo is an in-memory EOLWorkflowRepository. Each Mark* method
// advances current_stage the same way the vehicle_eol_workflow triggers do, so
// usecase tests observe the stage transitions the real repository produces.
type fakeEOLWorkflowRepo struct {
	rows map[string]*domain.EOLWorkflow
}

func newFakeEOLWorkflowRepo() *fakeEOLWorkflowRepo {
	return &fakeEOLWorkflowRepo{rows: map[string]*domain.EOLWorkflow{}}
}

// seed registers a vehicle's workflow row the way fn_initialize_vehicle_progress
// does on vehicle insert.
func (f *fakeEOLWorkflowRepo) seed(vin string) *domain.EOLWorkflow {
	w := &domain.EOLWorkflow{VIN: vin, CurrentStage: domain.EOLStageBranch}
	f.rows[vin] = w
	return w
}

func (f *fakeEOLWorkflowRepo) Get(_ context.Context, vin string) (*domain.EOLWorkflow, error) {
	w, ok := f.rows[vin]
	if !ok {
		return nil, domain.ErrNotFound
	}
	copied := *w
	return &copied, nil
}

func (f *fakeEOLWorkflowRepo) GetView(_ context.Context, vin string) (*domain.EOLWorkflowView, error) {
	w, ok := f.rows[vin]
	if !ok {
		return nil, domain.ErrNotFound
	}
	return &domain.EOLWorkflowView{
		VIN:                            w.VIN,
		CurrentStage:                   w.CurrentStage,
		BranchShip:                     domain.EOLStageRecord{At: w.BranchShippedAt, ByUserID: w.BranchShippedBy},
		DepotRelease:                   domain.EOLStageRecord{At: w.DepotReleasedAt, ByUserID: w.DepotReleasedBy},
		DocumentApprove:                domain.EOLStageRecord{At: w.DocumentApprovedAt, ByUserID: w.DocumentApprovedBy},
		BranchOpenIssueCountAtShipment: w.BranchOpenIssueCountAtShipment,
	}, nil
}

func (f *fakeEOLWorkflowRepo) MarkBranchShipped(_ context.Context, vin string, actorID, openIssueCount int) error {
	w, ok := f.rows[vin]
	if !ok || w.BranchShippedAt != nil {
		return domain.ErrNotFound
	}
	now := time.Now()
	w.BranchShippedAt = &now
	w.BranchShippedBy = &actorID
	w.BranchOpenIssueCountAtShipment = &openIssueCount
	w.CurrentStage = domain.EOLStageDepot
	return nil
}

func (f *fakeEOLWorkflowRepo) MarkDepotReleased(_ context.Context, vin string, actorID int) error {
	w, ok := f.rows[vin]
	if !ok || w.DepotReleasedAt != nil {
		return domain.ErrNotFound
	}
	now := time.Now()
	w.DepotReleasedAt = &now
	w.DepotReleasedBy = &actorID
	w.CurrentStage = domain.EOLStageDocument
	return nil
}

func (f *fakeEOLWorkflowRepo) MarkDocumentApproved(_ context.Context, vin string, actorID int) error {
	w, ok := f.rows[vin]
	if !ok || w.DocumentApprovedAt != nil {
		return domain.ErrNotFound
	}
	now := time.Now()
	w.DocumentApprovedAt = &now
	w.DocumentApprovedBy = &actorID
	w.CurrentStage = domain.EOLStageCompleted
	return nil
}

// operatorPermissions and managerPermissions mirror the role_permissions rows
// migration 0002 seeds for the two roles that exist today, so usecase tests
// exercise the same permission sets the running system resolves.
func operatorPermissions() domain.PermissionSet {
	return domain.NewPermissionSet([]domain.Permission{
		{Code: domain.PermissionVehicleView},
		{Code: domain.PermissionStationStepUpdate},
		{Code: domain.PermissionChecklistItemUpdate},
		{Code: domain.PermissionIssueCreate},
		{Code: domain.PermissionIssueTransitionInProgress},
		{Code: domain.PermissionIssueTransitionDone},
	})
}

func managerPermissions() domain.PermissionSet {
	return domain.NewPermissionSet([]domain.Permission{
		{Code: domain.PermissionVehicleView},
		{Code: domain.PermissionStationStepUpdate},
		{Code: domain.PermissionChecklistItemUpdate},
		{Code: domain.PermissionIssueCreate},
		{Code: domain.PermissionIssueTransitionInProgress},
		{Code: domain.PermissionIssueTransitionDone},
		{Code: domain.PermissionIssueTransitionApprove},
		{Code: domain.PermissionIssueTransitionConditionalApprove},
		{Code: domain.PermissionEOLBranchShip},
		{Code: domain.PermissionEOLDepotRelease},
		{Code: domain.PermissionEOLDocumentApprove},
		{Code: domain.PermissionAnalysisView},
		{Code: domain.PermissionAdminManageMasters},
	})
}

// fakeMediaRepo is an in-memory media_attachments table. existing holds the
// entity keys the fake considers real, standing in for the rows a polymorphic
// entity_id could point at.
type fakeMediaRepo struct {
	rows     []domain.MediaAttachment
	existing map[string]bool
	nextID   int64
}

func newFakeMediaRepo() *fakeMediaRepo {
	return &fakeMediaRepo{existing: map[string]bool{}, nextID: 1}
}

// seedEntity marks one entity as existing, so an upload against it is allowed.
func (f *fakeMediaRepo) seedEntity(entityType domain.MediaEntityType, entityID string) {
	f.existing[string(entityType)+"|"+entityID] = true
}

func (f *fakeMediaRepo) Create(_ context.Context, attachment *domain.MediaAttachment) (int64, error) {
	id := f.nextID
	f.nextID++

	stored := *attachment
	stored.ID = id
	stored.UploadedAt = time.Now()
	f.rows = append(f.rows, stored)
	return id, nil
}

func (f *fakeMediaRepo) ListForEntity(_ context.Context, entityType domain.MediaEntityType, entityID string) ([]domain.MediaAttachment, error) {
	var out []domain.MediaAttachment
	for _, row := range f.rows {
		if row.EntityType == entityType && row.EntityID == entityID {
			out = append(out, row)
		}
	}
	return out, nil
}

func (f *fakeMediaRepo) EntityExists(_ context.Context, entityType domain.MediaEntityType, entityID string) (bool, error) {
	return f.existing[string(entityType)+"|"+entityID], nil
}

// fakeMediaStore records what was written instead of touching the filesystem,
// which also lets a test assert that a rejected upload stored nothing.
type fakeMediaStore struct {
	saved []string
	err   error
}

func (f *fakeMediaStore) Save(
	_ context.Context,
	entityType domain.MediaEntityType,
	entityID, fileName string,
	content io.Reader,
) (string, int64, error) {
	if f.err != nil {
		return "", 0, f.err
	}
	body, err := io.ReadAll(content)
	if err != nil {
		return "", 0, err
	}
	path := strings.ToLower(string(entityType)) + "/" + entityID + "/" + fileName
	f.saved = append(f.saved, path)
	return path, int64(len(body)), nil
}
