package postgres

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/repository"
)

// EOLWorkflowRepo is the Postgres-backed EOLWorkflowRepository.
type EOLWorkflowRepo struct {
	pool *pgxpool.Pool
}

// NewEOLWorkflowRepo constructs an EOLWorkflowRepo.
func NewEOLWorkflowRepo(pool *pgxpool.Pool) *EOLWorkflowRepo {
	return &EOLWorkflowRepo{pool: pool}
}

var _ repository.EOLWorkflowRepository = (*EOLWorkflowRepo)(nil)

// Get returns the vehicle's EOL workflow row.
func (r *EOLWorkflowRepo) Get(ctx context.Context, vin string) (*domain.EOLWorkflow, error) {
	var w domain.EOLWorkflow
	var stage string
	err := executor(ctx, r.pool).QueryRow(ctx,
		`SELECT vin, current_stage,
		        branch_shipped_at, branch_shipped_by, branch_open_issue_count_at_shipment,
		        depot_released_at, depot_released_by,
		        document_approved_at, document_approved_by,
		        delivered_at, delivered_by,
		        created_at, updated_at
		 FROM vehicle_eol_workflow WHERE vin = $1`, vin).Scan(
		&w.VIN, &stage,
		&w.BranchShippedAt, &w.BranchShippedBy, &w.BranchOpenIssueCountAtShipment,
		&w.DepotReleasedAt, &w.DepotReleasedBy,
		&w.DocumentApprovedAt, &w.DocumentApprovedBy,
		&w.DeliveredAt, &w.DeliveredBy,
		&w.CreatedAt, &w.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, domain.ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	w.CurrentStage = domain.EOLWorkflowStage(stage)
	return &w, nil
}

// GetView returns the workflow with each stage's actor resolved to a name for
// the Vehicle Detail EoL tab.
func (r *EOLWorkflowRepo) GetView(ctx context.Context, vin string) (*domain.EOLWorkflowView, error) {
	var v domain.EOLWorkflowView
	var stage string
	var branchName, depotName, documentName, deliverName *string
	err := r.pool.QueryRow(ctx,
		`SELECT w.vin, w.current_stage, w.branch_open_issue_count_at_shipment,
		        w.branch_shipped_at, w.branch_shipped_by, bu.full_name,
		        w.depot_released_at, w.depot_released_by, du.full_name,
		        w.document_approved_at, w.document_approved_by, au.full_name,
		        w.delivered_at, w.delivered_by, lv.full_name
		 FROM vehicle_eol_workflow w
		 LEFT JOIN users bu ON bu.id = w.branch_shipped_by
		 LEFT JOIN users du ON du.id = w.depot_released_by
		 LEFT JOIN users au ON au.id = w.document_approved_by
		 LEFT JOIN users lv ON lv.id = w.delivered_by
		 WHERE w.vin = $1`, vin).Scan(
		&v.VIN, &stage, &v.BranchOpenIssueCountAtShipment,
		&v.BranchShip.At, &v.BranchShip.ByUserID, &branchName,
		&v.DepotRelease.At, &v.DepotRelease.ByUserID, &depotName,
		&v.DocumentApprove.At, &v.DocumentApprove.ByUserID, &documentName,
		&v.Deliver.At, &v.Deliver.ByUserID, &deliverName,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, domain.ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	v.CurrentStage = domain.EOLWorkflowStage(stage)
	v.BranchShip.ByName = derefString(branchName)
	v.DepotRelease.ByName = derefString(depotName)
	v.DocumentApprove.ByName = derefString(documentName)
	v.Deliver.ByName = derefString(deliverName)
	return &v, nil
}

// MarkBranchShipped records the branch shipment. The stage and open-issue
// snapshot are written here as well as by fn_enforce_branch_shipment so the
// application layer does not depend on trigger side effects to stay correct.
func (r *EOLWorkflowRepo) MarkBranchShipped(ctx context.Context, vin string, actorID, openIssueCount int) error {
	return r.mark(ctx,
		`UPDATE vehicle_eol_workflow
		 SET branch_shipped_at = now(), branch_shipped_by = $2,
		     branch_open_issue_count_at_shipment = $3, current_stage = 'DEPOT'
		 WHERE vin = $1 AND branch_shipped_at IS NULL`,
		vin, actorID, openIssueCount)
}

// MarkDepotReleased records the depot release and completes the workflow.
// fn_enforce_depot_release raises if the branch has not shipped or any issue
// is still open, so a caller that skipped the gate check still cannot get
// past this write.
func (r *EOLWorkflowRepo) MarkDepotReleased(ctx context.Context, vin string, actorID int) error {
	return r.mark(ctx,
		`UPDATE vehicle_eol_workflow
		 SET depot_released_at = now(), depot_released_by = $2, current_stage = 'COMPLETED'
		 WHERE vin = $1 AND depot_released_at IS NULL`,
		vin, actorID)
}

// ResetToBranch clears every stage timestamp and returns the workflow to BRANCH.
// The vehicle status change is the caller's job (IN_PRODUCTION) so this stays
// a single-table write.
func (r *EOLWorkflowRepo) ResetToBranch(ctx context.Context, vin string) error {
	return r.mark(ctx,
		`UPDATE vehicle_eol_workflow
		 SET current_stage = 'BRANCH',
		     branch_shipped_at = NULL, branch_shipped_by = NULL,
		     branch_open_issue_count_at_shipment = NULL,
		     depot_released_at = NULL, depot_released_by = NULL,
		     document_approved_at = NULL, document_approved_by = NULL,
		     delivered_at = NULL, delivered_by = NULL
		 WHERE vin = $1`,
		vin)
}

// MarkDelivered records the one-time deliver stamp. fn_enforce_eol_deliver
// rejects the write when depot release has not been recorded.
func (r *EOLWorkflowRepo) MarkDelivered(ctx context.Context, vin string, actorID int) error {
	return r.mark(ctx,
		`UPDATE vehicle_eol_workflow
		 SET delivered_at = now(), delivered_by = $2
		 WHERE vin = $1 AND delivered_at IS NULL AND depot_released_at IS NOT NULL`,
		vin, actorID)
}

// MarkDocumentApproved writes the unused document columns. Live flow does
// not call this; columns stay so the stage can be re-enabled later.
func (r *EOLWorkflowRepo) MarkDocumentApproved(ctx context.Context, vin string, actorID int) error {
	return r.mark(ctx,
		`UPDATE vehicle_eol_workflow
		 SET document_approved_at = now(), document_approved_by = $2, current_stage = 'COMPLETED'
		 WHERE vin = $1 AND document_approved_at IS NULL`,
		vin, actorID)
}

// mark runs a stage-marking UPDATE whose WHERE clause also guards against
// re-running a stage, so a duplicate request affects no rows.
func (r *EOLWorkflowRepo) mark(ctx context.Context, query string, args ...any) error {
	tag, err := executor(ctx, r.pool).Exec(ctx, query, args...)
	if err != nil {
		return mapRaiseException(err)
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrNotFound
	}
	return nil
}

func derefString(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
