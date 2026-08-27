package domain

import "time"

// Role mirrors a row in the roles table. RBAC is table-driven (Karar 3): new
// roles are rows in roles/role_permissions, not values in a hardcoded enum.
// IsActive is checked at login so a deactivated role cannot obtain a JWT;
// GetPermissionsForUser also grants nothing for inactive roles as a safety
// net for tokens issued before the role was deactivated.
type Role struct {
	ID       int
	Code     string
	Name     string
	IsActive bool
}

// Permission mirrors a row in the permissions table. Endpoint authorization is
// decided on permission codes, never role codes, so granting a new role access
// to an endpoint is a role_permissions row rather than a code change.
type Permission struct {
	ID          int
	Code        string
	Description string
}

// Seeded role codes. Clients must not branch on these for authorization —
// they are identifiers in the catalogue (login display, seed data).
const (
	RoleCodeOperator     = "OPERATOR"
	RoleCodeManagerAdmin = "MANAGER_ADMIN"
	RoleCodeQuality      = "QUALITY"
	RoleCodeAssembly     = "ASSEMBLY"
)

// Permission codes (Karar 3 phase 2 catalogue). Route wiring and usecases
// reference these constants so a typo is a compile error rather than a silent
// 403.
const (
	PermissionMobileAccess                      = "mobile.access"
	PermissionWebAccess                         = "web.access"
	PermissionVehicleView                       = "vehicle.view"
	PermissionStationStepEdit                   = "station.step.edit"
	PermissionChecklistTestView                 = "checklist.test.view"
	PermissionChecklistTestEdit                 = "checklist.test.edit"
	PermissionChecklistShipmentView             = "checklist.shipment.view"
	PermissionChecklistShipmentEdit             = "checklist.shipment.edit"
	PermissionChecklistEOLView                  = "checklist.eol.view"
	PermissionChecklistEOLEdit                  = "checklist.eol.edit"
	PermissionEOLBranchShip                     = "eol.branch_ship"
	PermissionEOLDepotRelease                   = "eol.depot_release"
	PermissionEOLDocumentApprove                = "eol.document_approve"
	PermissionIssueView                         = "issue.view"
	PermissionIssueCreate                       = "issue.create"
	PermissionIssueTransitionProgress           = "issue.transition.progress"
	PermissionIssueTransitionApprove            = "issue.transition.approve"
	PermissionIssueTransitionConditionalApprove = "issue.transition.conditional_approve"
	PermissionAnalysisView                      = "analysis.view"
	PermissionAdminManageUsers                  = "admin.manage_users"
	PermissionAdminManageMasters                = "admin.manage_masters"
)

// ChecklistViewPermission is the read permission for one checklist type.
func ChecklistViewPermission(t ChecklistType) string {
	switch t {
	case ChecklistTypeTest:
		return PermissionChecklistTestView
	case ChecklistTypeShipment:
		return PermissionChecklistShipmentView
	case ChecklistTypeEOL:
		return PermissionChecklistEOLView
	default:
		return ""
	}
}

// ChecklistEditPermission is the write permission for one checklist type.
func ChecklistEditPermission(t ChecklistType) string {
	switch t {
	case ChecklistTypeTest:
		return PermissionChecklistTestEdit
	case ChecklistTypeShipment:
		return PermissionChecklistShipmentEdit
	case ChecklistTypeEOL:
		return PermissionChecklistEOLEdit
	default:
		return ""
	}
}

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

// Codes returns the granted permission codes in unspecified order.
func (s PermissionSet) Codes() []string {
	out := make([]string, 0, len(s))
	for code := range s {
		out = append(out, code)
	}
	return out
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
	// MustChangePassword is set when an admin created the account or reset
	// the password. The user may authenticate, but every other API call is
	// rejected until they change the password.
	MustChangePassword bool
	CreatedAt          time.Time
}
