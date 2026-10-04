package usecase

import (
	"context"
	"errors"
	"regexp"
	"strings"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/repository"
)

var roleCodePattern = regexp.MustCompile(`^[A-Z][A-Z0-9_]{1,48}$`)

// RoleAdmin is the permission-matrix editor (Karar 3). Route gate is
// admin.manage_users. Removing admin.manage_users from the last granting
// role, or from the last active holders, is rejected with ErrLastActiveManager.
// Role creation and grant changes write ROLE_PERMISSION_CHANGE audit rows.
type RoleAdmin struct {
	roles   repository.RoleRepository
	users   repository.UserRepository
	auditor adminAuditor
}

// NewRoleAdmin wires the matrix usecase.
func NewRoleAdmin(
	roles repository.RoleRepository,
	users repository.UserRepository,
	audit repository.AuditRepository,
	uow repository.TransactionManager,
) *RoleAdmin {
	return &RoleAdmin{roles: roles, users: users, auditor: adminAuditor{audit: audit, uow: uow}}
}

// RoleGrant is one catalogue role plus the permission codes it currently holds.
type RoleGrant struct {
	Role        domain.Role
	Permissions []string
}

// Matrix is the payload for the Roles screen: every role, every permission,
// and the current grants.
type Matrix struct {
	Roles       []RoleGrant
	Permissions []domain.Permission
}

// Matrix returns the full RBAC snapshot.
func (a *RoleAdmin) Matrix(ctx context.Context) (*Matrix, error) {
	roles, err := a.roles.ListRoles(ctx)
	if err != nil {
		return nil, err
	}
	perms, err := a.roles.ListPermissions(ctx)
	if err != nil {
		return nil, err
	}
	assignable := make([]domain.Permission, 0, len(perms))
	for _, p := range perms {
		if domain.IsAssignablePermission(p.Code) {
			assignable = append(assignable, p)
		}
	}
	out := &Matrix{Roles: make([]RoleGrant, 0, len(roles)), Permissions: assignable}
	for _, role := range roles {
		granted, err := a.roles.GetPermissionsForRole(ctx, role.ID)
		if err != nil {
			return nil, err
		}
		codes := make([]string, 0, len(granted))
		for _, p := range granted {
			if !domain.IsAssignablePermission(p.Code) {
				continue
			}
			codes = append(codes, p.Code)
		}
		out.Roles = append(out.Roles, RoleGrant{Role: role, Permissions: codes})
	}
	return out, nil
}

// CreateRole inserts a new role with no grants. Code is normalized to upper
// snake so matrix-created roles match the seeded catalogue style.
func (a *RoleAdmin) CreateRole(ctx context.Context, actorID int, code, name string) (*domain.Role, error) {
	code = strings.ToUpper(strings.TrimSpace(code))
	name = strings.TrimSpace(name)
	if name == "" {
		name = code
	}
	if !roleCodePattern.MatchString(code) {
		return nil, domain.ErrInvalidEnumValue
	}
	existing, err := a.roles.GetByCode(ctx, code)
	if err == nil && existing != nil {
		return nil, domain.ErrInvalidEnumValue
	}
	if err != nil && !errors.Is(err, domain.ErrNotFound) {
		return nil, err
	}
	var role *domain.Role
	err = a.auditor.withTx(ctx, func(txCtx context.Context) error {
		var err error
		role, err = a.roles.CreateRole(txCtx, code, name)
		if err != nil {
			return err
		}
		d := domain.AdminAuditDetail{
			Action:   domain.AdminActionCreate,
			Entity:   domain.AdminEntityRole,
			EntityID: role.ID,
			Subject:  roleValue(*role),
		}
		d.AddChange(domain.AdminFieldName, domain.AdminAuditValue{}, domain.AdminText(role.Name))
		return a.auditor.record(txCtx, domain.AuditEventRolePermission, actorID, d)
	})
	if err != nil {
		return nil, err
	}
	return role, nil
}

// ReplaceGrants overwrites one role's permission set. Unknown codes 400.
// The audit row lists the permissions granted and revoked; an unchanged set
// writes nothing.
func (a *RoleAdmin) ReplaceGrants(ctx context.Context, actorID, roleID int, codes []string) error {
	role, err := a.roles.GetByID(ctx, roleID)
	if err != nil {
		return err
	}
	catalogue, err := a.roles.ListPermissions(ctx)
	if err != nil {
		return err
	}
	byCode := make(map[string]domain.Permission, len(catalogue))
	for _, p := range catalogue {
		byCode[p.Code] = p
	}
	ids := make([]int, 0, len(codes))
	seen := make(map[string]struct{}, len(codes))
	newHasUserAdmin := false
	for _, code := range codes {
		if _, dup := seen[code]; dup {
			continue
		}
		seen[code] = struct{}{}
		if !domain.IsAssignablePermission(code) {
			return domain.ErrInvalidEnumValue
		}
		p, ok := byCode[code]
		if !ok {
			return domain.ErrInvalidEnumValue
		}
		ids = append(ids, p.ID)
		if code == domain.PermissionAdminManageUsers {
			newHasUserAdmin = true
		}
	}

	currentlyHas, err := roleHasPermission(ctx, a.roles, roleID, domain.PermissionAdminManageUsers)
	if err != nil {
		return err
	}
	if currentlyHas && !newHasUserAdmin {
		otherRoles, err := a.roles.CountRolesWithPermissionExcept(ctx, domain.PermissionAdminManageUsers, roleID)
		if err != nil {
			return err
		}
		if otherRoles == 0 {
			return domain.ErrLastActiveManager
		}
		remaining, err := a.users.CountActiveUsersWithPermissionExceptRole(ctx, domain.PermissionAdminManageUsers, roleID)
		if err != nil {
			return err
		}
		if remaining == 0 {
			return domain.ErrLastActiveManager
		}
	}

	current, err := a.roles.GetPermissionsForRole(ctx, roleID)
	if err != nil {
		return err
	}
	had := make(map[string]struct{}, len(current))
	d := domain.AdminAuditDetail{
		Action:   domain.AdminActionGrantsChange,
		Entity:   domain.AdminEntityRole,
		EntityID: role.ID,
		Subject:  roleValue(*role),
	}
	for _, p := range current {
		had[p.Code] = struct{}{}
		if _, keep := seen[p.Code]; !keep {
			d.Revoked = append(d.Revoked, permissionValue(p))
		}
	}
	for code := range seen {
		if _, ok := had[code]; !ok {
			d.Granted = append(d.Granted, permissionValue(byCode[code]))
		}
	}
	sortValuesByCode(d.Granted)
	sortValuesByCode(d.Revoked)

	return a.auditor.withTx(ctx, func(txCtx context.Context) error {
		if err := a.roles.ReplaceRolePermissions(txCtx, roleID, ids); err != nil {
			return err
		}
		if len(d.Granted) == 0 && len(d.Revoked) == 0 {
			return nil
		}
		return a.auditor.record(txCtx, domain.AuditEventRolePermission, actorID, d)
	})
}
