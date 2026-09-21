package usecase

import (
	"context"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/repository"
)

// EOLDocumentApprover is dormant (Karar 2 / migration 0011): the document
// stage was removed from the EOL flow. The HTTP route returns 410 and never
// calls Approve. The usecase is retained so a future re-enable does not need
// to rebuild the write path; document_approved_* columns stay historical.
type EOLDocumentApprover struct {
	vehicles repository.VehicleRepository
	workflow repository.EOLWorkflowRepository
	uow      repository.TransactionManager
}

// NewEOLDocumentApprover wires the usecase with its repositories.
func NewEOLDocumentApprover(
	vehicles repository.VehicleRepository,
	workflow repository.EOLWorkflowRepository,
	uow repository.TransactionManager,
) *EOLDocumentApprover {
	return &EOLDocumentApprover{vehicles: vehicles, workflow: workflow, uow: uow}
}

// DocumentApproveOutput reports a completed EOL workflow.
type DocumentApproveOutput struct {
	VIN           string                  `json:"vin"`
	CurrentStage  domain.EOLWorkflowStage `json:"current_stage"`
	VehicleStatus domain.VehicleStatus    `json:"vehicle_status"`
}

// Approve is dormant (Karar 2): the HTTP handler returns 410 and never
// calls this. If invoked directly, refuse without mutating state.
func (s *EOLDocumentApprover) Approve(ctx context.Context, vin string, actorID int) (*DocumentApproveOutput, error) {
	_ = ctx
	_ = vin
	_ = actorID
	_ = s
	return nil, domain.ErrEndpointRetired
}

// EOLWorkflowReader serves the Vehicle Detail EoL tab.
type EOLWorkflowReader struct {
	workflow     repository.EOLWorkflowRepository
	issues       repository.IssueRepository
	checklists   *ChecklistResultRecorder
	progress     repository.ChecklistProgressRepository
	stationSteps repository.StationStepProgressRepository
}

// NewEOLWorkflowReader wires the usecase with its repositories.
func NewEOLWorkflowReader(
	workflow repository.EOLWorkflowRepository,
	issues repository.IssueRepository,
	checklists *ChecklistResultRecorder,
	progress repository.ChecklistProgressRepository,
	stationSteps repository.StationStepProgressRepository,
) *EOLWorkflowReader {
	return &EOLWorkflowReader{
		workflow:     workflow,
		issues:       issues,
		checklists:   checklists,
		progress:     progress,
		stationSteps: stationSteps,
	}
}

// Get returns the current stage, each stage's timestamp/actor, and
// server-computed gate readiness (single source of truth for web/mobile).
func (r *EOLWorkflowReader) Get(ctx context.Context, vin string) (*domain.EOLWorkflowView, error) {
	view, err := r.workflow.GetView(ctx, vin)
	if err != nil {
		return nil, err
	}
	workflow, err := r.workflow.Get(ctx, vin)
	if err != nil {
		return nil, err
	}

	blockers, err := BranchShipBlockers(ctx, vin, r.checklists, r.progress)
	if err != nil {
		return nil, err
	}
	stepsLeft, err := IncompleteStationSteps(ctx, vin, r.stationSteps)
	if err != nil {
		return nil, err
	}
	depotRemaining, depotMissing, err := DepotEOLRemainders(ctx, vin, r.checklists)
	if err != nil {
		return nil, err
	}
	openIssues, err := r.issues.ListOpenByVIN(ctx, vin)
	if err != nil {
		return nil, err
	}

	view.Gates = BuildEOLGates(
		workflow,
		blockers,
		stepsLeft,
		depotRemaining,
		depotMissing,
		len(openIssues),
	)
	return view, nil
}
