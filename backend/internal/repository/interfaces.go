// Package repository defines persistence interfaces consumed by the usecase
// layer. Concrete implementations live in sub-packages (e.g. postgres).
package repository

import (
	"context"

	"github.com/karea/backend/internal/domain"
)

// VehicleRepository persists and queries vehicles.
type VehicleRepository interface {
	// GetByVIN returns the vehicle with the exact VIN, or domain.ErrNotFound.
	GetByVIN(ctx context.Context, vin string) (*domain.Vehicle, error)
	// List returns vehicles matching the filter (with pagination).
	List(ctx context.Context, f domain.VehicleListFilter) ([]domain.Vehicle, error)
	// Count returns the total number of vehicles matching the filter, ignoring
	// pagination (used to compute page counts).
	Count(ctx context.Context, f domain.VehicleListFilter) (int, error)
	// GetByVehicleNumber returns the vehicle carrying the given short factory
	// number (Karar 5), or domain.ErrNotFound.
	GetByVehicleNumber(ctx context.Context, vehicleNumber string) (*domain.Vehicle, error)
	// SearchByVINSuffix returns vehicles whose VIN contains the given suffix
	// (partial trigram search), capped at limit rows.
	SearchByVINSuffix(ctx context.Context, suffix string, limit int) ([]domain.Vehicle, error)
	// UpdateProgress persists the recomputed completion percentage and current
	// station for a vehicle.
	UpdateProgress(ctx context.Context, vin string, percentage float64, currentStationID *int) error
	// UpdateStatus persists a new global status for a vehicle.
	UpdateStatus(ctx context.Context, vin string, status domain.VehicleStatus) error
}

// StationStepProgressRepository persists and queries per-vehicle station step
// progress (vehicle_station_step_progress).
type StationStepProgressRepository interface {
	// ListByVIN returns all station step progress rows for a vehicle.
	ListByVIN(ctx context.Context, vin string) ([]domain.VehicleStationStepProgress, error)
	// ListCatalogueWithProgress joins the station step catalogue with progress
	// for the given VIN.
	ListCatalogueWithProgress(ctx context.Context, vin string) ([]domain.StationStepItemView, error)
	// CountOpenIssuesByStation counts open/in-progress/done issues per station
	// for the VIN (keyed by station id).
	CountOpenIssuesByStation(ctx context.Context, vin string) (map[int]int, error)
	// SaveResult updates the status (and checker/timestamp) of a single
	// pre-materialized station step progress row.
	SaveResult(ctx context.Context, vin string, stationStepID int, status domain.StationStepStatus, checkedBy int) error
}

// ChecklistProgressRepository persists and queries per-vehicle checklist
// progress (checklist_item_progress).
type ChecklistProgressRepository interface {
	// ListByVINAndType returns all checklist progress rows of a given type for
	// a vehicle.
	ListByVINAndType(ctx context.Context, vin string, checklistType domain.ChecklistType) ([]domain.ChecklistProgress, error)
	// ResolveDefaultTemplateID returns the active default template (vehicle_model_id
	// IS NULL) for the given checklist type.
	ResolveDefaultTemplateID(ctx context.Context, checklistType domain.ChecklistType) (int, error)
	// ListItemsWithProgress joins template items with per-vehicle progress for
	// the given template.
	ListItemsWithProgress(ctx context.Context, vin string, checklistType domain.ChecklistType, templateID int) ([]domain.ChecklistItemView, error)
	// SaveResult updates a single pre-materialized checklist progress row.
	SaveResult(ctx context.Context, result domain.ChecklistProgress) error
	// ListTemplates returns every checklist template with a live count of its
	// active items. The /templates admin page uses this so EOL/SHIPMENT/TEST
	// counts always match checklist_template_items rather than a hardcoded seed.
	ListTemplates(ctx context.Context) ([]domain.ChecklistTemplateSummary, error)
	// ListTemplateItems returns the active items of one template, in item_no
	// order, for the template editor pane.
	ListTemplateItems(ctx context.Context, templateID int) ([]domain.ChecklistTemplateItem, error)
}

// IssueRepository persists and queries issues.
type IssueRepository interface {
	// Create inserts a new issue and returns its generated ID.
	Create(ctx context.Context, issue *domain.Issue) (int64, error)
	// GetByID returns the issue with the given ID, or domain.ErrNotFound.
	GetByID(ctx context.Context, id int64) (*domain.Issue, error)
	// ListForUser returns issues where the user is issue, process, or finish
	// reporter. When status is non-nil, results are filtered to that status.
	ListForUser(ctx context.Context, userID int, status *domain.IssueStatus) ([]domain.Issue, error)
	// ListOpenByVIN returns the vehicle's issues that are not yet closed
	// (OPEN/IN_PROGRESS/DONE), which is what the EOL gates are evaluated
	// against.
	ListOpenByVIN(ctx context.Context, vin string) ([]domain.Issue, error)
	// UpdateStatus transitions an issue to a new status, recording the acting
	// user against the appropriate lifecycle timestamp column.
	UpdateStatus(ctx context.Context, id int64, status domain.IssueStatus, actorID int) error
}

// StationRepository reads the station catalogue.
type StationRepository interface {
	// List returns all stations in line order.
	List(ctx context.Context) ([]domain.Station, error)
}

// AnalysisRepository reads the Analysis-tab SQL views.
type AnalysisRepository interface {
	DailyPendingIssues(ctx context.Context, f domain.AnalysisFilter) ([]domain.DailyPendingIssue, error)
	CompletedIssuesDaily(ctx context.Context, f domain.AnalysisFilter) ([]domain.CompletedIssuesDaily, error)
	DefectRatePerStation(ctx context.Context, f domain.AnalysisFilter) ([]domain.StationDefectRate, error)
	MTTRPerStation(ctx context.Context, f domain.AnalysisFilter) ([]domain.StationMTTR, error)
	VehicleSeverityBreakdown(ctx context.Context, f domain.AnalysisFilter) ([]domain.VehicleSeverityBreakdown, error)
}

// UserRepository persists and queries users (used by auth).
type UserRepository interface {
	GetByEmail(ctx context.Context, email string) (*domain.User, error)
	GetByID(ctx context.Context, id int) (*domain.User, error)
}

// EOLWorkflowRepository persists and queries the three-stage EOL workflow
// (Karar 2, vehicle_eol_workflow).
type EOLWorkflowRepository interface {
	// Get returns the vehicle's workflow row, or domain.ErrNotFound.
	Get(ctx context.Context, vin string) (*domain.EOLWorkflow, error)
	// GetView returns the workflow resolved for display, with the acting
	// user's name attached to each completed stage.
	GetView(ctx context.Context, vin string) (*domain.EOLWorkflowView, error)
	// MarkBranchShipped records the branch shipment together with the
	// soft-warning snapshot of how many issues were still open, and advances
	// the workflow to DEPOT.
	MarkBranchShipped(ctx context.Context, vin string, actorID, openIssueCount int) error
	// MarkDepotReleased records the depot release and advances the workflow to
	// DOCUMENT. fn_enforce_depot_release rejects the write if open issues
	// remain, so this fails even when the caller skipped the gate check.
	MarkDepotReleased(ctx context.Context, vin string, actorID int) error
	// MarkDocumentApproved records the final sign-off and completes the
	// workflow.
	MarkDocumentApproved(ctx context.Context, vin string, actorID int) error
	// ResetToBranch clears every stage timestamp and returns the workflow to
	// BRANCH. Dev-only: the HTTP layer 404s this outside APP_ENV=development.
	ResetToBranch(ctx context.Context, vin string) error
}

// MediaRepository persists and queries polymorphic file attachments
// (Karar 8, media_attachments).
type MediaRepository interface {
	// Create inserts an attachment and returns its generated ID.
	Create(ctx context.Context, attachment *domain.MediaAttachment) (int64, error)
	// ListForEntity returns every attachment hanging off one entity, newest
	// first. An entity with no attachments yields an empty slice, not an error.
	ListForEntity(ctx context.Context, entityType domain.MediaEntityType, entityID string) ([]domain.MediaAttachment, error)
	// EntityExists reports whether the referenced row is really there.
	// media_attachments carries no foreign key — it cannot, being polymorphic
	// — so this is the application's stand-in for referential integrity.
	EntityExists(ctx context.Context, entityType domain.MediaEntityType, entityID string) (bool, error)
}

// RoleRepository reads the table-driven RBAC catalogue (Karar 3).
type RoleRepository interface {
	// GetPermissionsForUser returns every permission granted to the user
	// through their role, resolved in a single query.
	GetPermissionsForUser(ctx context.Context, userID int) ([]domain.Permission, error)
}

// AuditRepository appends rows to the append-only audit log.
type AuditRepository interface {
	Append(ctx context.Context, entry domain.AuditLog) error
}
