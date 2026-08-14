package domain

import "time"

// Role mirrors a row in the roles table. RBAC is table-driven (Karar 3): the
// v2 spec's eventual 8-role matrix is added as rows in roles/role_permissions,
// not as new values in a hardcoded enum. Only OPERATOR and MANAGER_ADMIN are
// seeded today.
type Role struct {
	ID   int
	Code string
	Name string
}

// Permission mirrors a row in the permissions table. Endpoint authorization is
// decided on permission codes, never role codes, so granting a new role access
// to an endpoint is a role_permissions row rather than a code change.
type Permission struct {
	ID   int
	Code string
}

// Role codes seeded by migration 0002. These are for coarse UI decisions (which
// app shell to render) only — never for endpoint authorization.
const (
	RoleCodeOperator     = "OPERATOR"
	RoleCodeManagerAdmin = "MANAGER_ADMIN"
)

// Permission codes seeded by migration 0002 (12_KAREA_v2_database_schema.sql
// Section 11). Route wiring and usecases reference these constants so a typo is
// a compile error rather than a silent 403.
const (
	PermissionVehicleView                       = "vehicle.view"
	PermissionStationStepUpdate                 = "station_step.update"
	PermissionChecklistItemUpdate               = "checklist_item.update"
	PermissionIssueCreate                       = "issue.create"
	PermissionIssueTransitionInProgress         = "issue.transition.in_progress"
	PermissionIssueTransitionDone               = "issue.transition.done"
	PermissionIssueTransitionApprove            = "issue.transition.approve"
	PermissionIssueTransitionConditionalApprove = "issue.transition.conditional_approve"
	PermissionEOLBranchShip                     = "eol.branch_ship"
	PermissionEOLDepotRelease                   = "eol.depot_release"
	PermissionEOLDocumentApprove                = "eol.document_approve"
	PermissionAnalysisView                      = "analysis.view"
	PermissionAdminManageMasters                = "admin.manage_masters"
)

// PermissionSet is a lookup-friendly view of the permissions granted to one
// user. It is resolved once per request and passed down to the layers that
// make authorization decisions.
type PermissionSet map[string]struct{}

// NewPermissionSet indexes permissions by code.
func NewPermissionSet(permissions []Permission) PermissionSet {
	set := make(PermissionSet, len(permissions))
	for _, p := range permissions {
		set[p.Code] = struct{}{}
	}
	return set
}

// Has reports whether the set grants the given permission code.
func (s PermissionSet) Has(code string) bool {
	_, ok := s[code]
	return ok
}

// User mirrors the users table.
type User struct {
	ID       int
	FullName string
	Email    string
	Role     Role
	// PasswordHash is the bcrypt hash of the user's password. It is tagged
	// json:"-" so it is never serialized into an API response, and must never
	// be logged.
	PasswordHash string `json:"-"`
	IsActive     bool
	CreatedAt    time.Time
}
