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
	// SearchByVINSuffix returns vehicles whose VIN contains the given suffix
	// (partial trigram search), capped at limit rows.
	SearchByVINSuffix(ctx context.Context, suffix string, limit int) ([]domain.Vehicle, error)
	// UpdateProgress persists the recomputed completion percentage and current
	// station for a vehicle.
	UpdateProgress(ctx context.Context, vin string, percentage float64, currentStationID *int) error
	// UpdateStatus persists a new global status for a vehicle.
	UpdateStatus(ctx context.Context, vin string, status domain.VehicleStatus) error
	// BulkInsertPlanned inserts VINs as PLANNED (model and station unset).
	// Existing VINs are skipped. Returns the VINs that were actually inserted.
	BulkInsertPlanned(ctx context.Context, vins []string) ([]string, error)
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
	// ListItemsWithProgress returns the vehicle's materialized checklist
	// rows joined to catalogue text. Items added to the template after the
	// vehicle was created are omitted (no backfill); deactivated items that
	// already have progress remain visible.
	ListItemsWithProgress(ctx context.Context, vin string, checklistType domain.ChecklistType, templateID int) ([]domain.ChecklistItemView, error)
	// SaveResult updates a single pre-materialized checklist progress row.
	SaveResult(ctx context.Context, result domain.ChecklistProgress) error
	// ListTemplates returns every checklist template with a live count of its
	// active items. The /templates admin page uses this so EOL/SHIPMENT/TEST
	// counts always match checklist_template_items rather than a hardcoded seed.
	ListTemplates(ctx context.Context) ([]domain.ChecklistTemplateSummary, error)
	// GetTemplate returns one checklist_templates row, or domain.ErrNotFound.
	GetTemplate(ctx context.Context, templateID int) (*domain.ChecklistTemplate, error)
	// GetTemplateItem returns one checklist_template_items row.
	GetTemplateItem(ctx context.Context, itemID int) (*domain.ChecklistTemplateItem, error)
	// ListTemplateItems returns every item of one template (including inactive),
	// in item_no order, for the template editor pane.
	ListTemplateItems(ctx context.Context, templateID int) ([]domain.ChecklistTemplateItem, error)
	// CreateTemplateItem inserts a catalogue item and assigns the next item_no.
	CreateTemplateItem(ctx context.Context, item *domain.ChecklistTemplateItem) (*domain.ChecklistTemplateItem, error)
	// UpdateTemplateItem persists item_text, eol_phase and is_active.
	UpdateTemplateItem(ctx context.Context, item *domain.ChecklistTemplateItem) error
	// DeleteTemplateItem removes a catalogue row. Callers must refuse when
	// progress exists; this is a hard delete of an unused item only.
	DeleteTemplateItem(ctx context.Context, itemID int) error
	// ReorderTemplateItems assigns item_no 1..n in the given id order.
	ReorderTemplateItems(ctx context.Context, templateID int, itemIDs []int) error
	// CountProgressVINs returns how many distinct vehicles have a progress
	// row for this catalogue item (used to block DELETE).
	CountProgressVINs(ctx context.Context, itemID int) (int, error)
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
	// ListAll returns every issue, optionally filtered by status. Used by the
	// web Issues queue and mobile Hatalar list (vehicle.view, not analysis.view).
	ListAll(ctx context.Context, status *domain.IssueStatus) ([]domain.Issue, error)
	// ListByVIN returns every issue for a vehicle (all statuses), optionally
	// filtered by status. Powers the Vehicle Detail Issues tab.
	ListByVIN(ctx context.Context, vin string, status *domain.IssueStatus) ([]domain.Issue, error)
	// ListOpenByVIN returns the vehicle's issues that are not yet closed
	// (OPEN/IN_PROGRESS/DONE), which is what the EOL gates are evaluated
	// against.
	ListOpenByVIN(ctx context.Context, vin string) ([]domain.Issue, error)
	// UpdateStatus transitions an issue to a new status, recording the acting
	// user against the appropriate lifecycle timestamp column. When status is
	// DONE, solutionDescription is persisted on solution_description.
	UpdateStatus(ctx context.Context, id int64, status domain.IssueStatus, actorID int, solutionDescription string) error
	// ListIssueTypes returns the issue_types catalogue (Hata / Tamir Gerekiyor).
	ListIssueTypes(ctx context.Context) ([]domain.IssueType, error)
}

// StationRepository reads the station catalogue.
type StationRepository interface {
	// List returns all stations in line order.
	List(ctx context.Context) ([]domain.Station, error)
}

// AnalysisRepository reads the Analysis-tab metrics. Every method honors
// AnalysisFilter (inclusive from/to calendar days).
type AnalysisRepository interface {
	DailyPendingIssues(ctx context.Context, f domain.AnalysisFilter) ([]domain.DailyPendingIssue, error)
	CompletedIssuesDaily(ctx context.Context, f domain.AnalysisFilter) ([]domain.CompletedIssuesDaily, error)
	DefectRatePerStation(ctx context.Context, f domain.AnalysisFilter) ([]domain.StationDefectRate, error)
	MTTRPerStation(ctx context.Context, f domain.AnalysisFilter) ([]domain.StationMTTR, error)
	VehicleSeverityBreakdown(ctx context.Context, f domain.AnalysisFilter) ([]domain.VehicleSeverityBreakdown, error)
	Dashboard(ctx context.Context, f domain.AnalysisFilter) (*domain.AnalysisDashboard, error)
}

// UserRepository persists and queries users (used by auth and the Users &
// Roles admin screen).
type UserRepository interface {
	GetByEmail(ctx context.Context, email string) (*domain.User, error)
	GetByID(ctx context.Context, id int) (*domain.User, error)
	// List returns every user, oldest id first. Password hashes are present
	// on the domain objects and must not be serialized to clients.
	List(ctx context.Context) ([]domain.User, error)
	// UpdateRoleAndActive assigns a role (by roles.id) and the is_active
	// flag. Self-lockout and last-admin.manage_users rules are enforced in
	// the usecase before this write.
	UpdateRoleAndActive(ctx context.Context, id, roleID int, isActive bool) error
	// CountActiveUsersWithPermission counts active users whose (active)
	// role currently grants the given permission code.
	CountActiveUsersWithPermission(ctx context.Context, permissionCode string) (int, error)
	// CountActiveUsersWithPermissionExceptRole is the same count excluding
	// one role, used when that role is about to lose the permission.
	CountActiveUsersWithPermissionExceptRole(ctx context.Context, permissionCode string, roleID int) (int, error)
	// Create inserts a user and returns the stored row (with generated id).
	// Duplicate emails return domain.ErrEmailTaken.
	Create(ctx context.Context, user *domain.User) (*domain.User, error)
	// UpdatePassword replaces password_hash and must_change_password.
	UpdatePassword(ctx context.Context, id int, passwordHash string, mustChange bool) error
	// CountReferences sums shop-floor FKs plus work-event audit_logs rows
	// (see domain.WorkAuditEventTypes). Zero means hard-delete is safe.
	CountReferences(ctx context.Context, id int) (int, error)
	// Delete removes the users row. Callers must refuse when references
	// exist; performed_by on audit_logs is never nulled. A leftover FK
	// surfaces as a 23503 from Postgres.
	Delete(ctx context.Context, id int) error
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
	// MarkDepotReleased records the depot release and completes the workflow.
	// fn_enforce_depot_release rejects the write if the branch has not shipped
	// or if open issues remain, so this fails even when the caller skipped
	// the gate check.
	MarkDepotReleased(ctx context.Context, vin string, actorID int) error
	// MarkDelivered records the one-time deliver stamp after depot release.
	MarkDelivered(ctx context.Context, vin string, actorID int) error
	// MarkDocumentApproved writes the unused document_approved_* columns.
	// The live flow does not call this; depot release is what completes
	// and ships.
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
	// ListByVIN returns every attachment for one vehicle, newest first
	// (Karar 11). A VIN with no attachments yields an empty slice, not an error.
	ListByVIN(ctx context.Context, vin string) ([]domain.MediaAttachment, error)
	// VINForEntity returns the vehicle VIN for the attachable entity, or
	// domain.ErrNotFound if that row does not exist. The polymorphic
	// entity_id still has no FK; this lookup is that missing check and also
	// supplies the denormalized vin written on insert (Karar 11).
	VINForEntity(ctx context.Context, entityType domain.MediaEntityType, entityID string) (string, error)
}

// RoleRepository reads the table-driven RBAC catalogue (Karar 3).
type RoleRepository interface {
	// GetPermissionsForUser returns every permission granted to the user
	// through their role, resolved in a single query.
	GetPermissionsForUser(ctx context.Context, userID int) ([]domain.Permission, error)
	// GetByCode returns the role catalogue row for the given code, or
	// domain.ErrNotFound.
	GetByCode(ctx context.Context, code string) (*domain.Role, error)
	GetByID(ctx context.Context, id int) (*domain.Role, error)
	ListRoles(ctx context.Context) ([]domain.Role, error)
	ListPermissions(ctx context.Context) ([]domain.Permission, error)
	GetPermissionsForRole(ctx context.Context, roleID int) ([]domain.Permission, error)
	// ReplaceRolePermissions overwrites the grant set for one role.
	ReplaceRolePermissions(ctx context.Context, roleID int, permissionIDs []int) error
	CreateRole(ctx context.Context, code, name string) (*domain.Role, error)
	CountRolesWithPermissionExcept(ctx context.Context, permissionCode string, roleID int) (int, error)
}

// AuditRepository appends rows to the append-only audit log.
type AuditRepository interface {
	Append(ctx context.Context, entry domain.AuditLog) error
	// ListIssueStatusHistory returns ISSUE_STATUS_CHANGE events for one issue,
	// oldest first, with the acting user's display name.
	ListIssueStatusHistory(ctx context.Context, issueID int64) ([]domain.IssueStatusHistoryEntry, error)
	// ListVehicleStatusHistory returns STATUS_CHANGE events for one VIN,
	// oldest first, with the acting user's display name.
	ListVehicleStatusHistory(ctx context.Context, vin string) ([]domain.VehicleStatusHistoryEntry, error)
}
