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
type RoleAdmin struct {
	roles repository.RoleRepository
	users repository.UserRepository
}

// NewRoleAdmin wires the matrix usecase.
func NewRoleAdmin(roles repository.RoleRepository, users repository.UserRepository) *RoleAdmin {
	return &RoleAdmin{roles: roles, users: users}
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
	out := &Matrix{Roles: make([]RoleGrant, 0, len(roles)), Permissions: perms}
	for _, role := range roles {
		granted, err := a.roles.GetPermissionsForRole(ctx, role.ID)
		if err != nil {
			return nil, err
		}
		codes := make([]string, 0, len(granted))
		for _, p := range granted {
			codes = append(codes, p.Code)
		}
		out.Roles = append(out.Roles, RoleGrant{Role: role, Permissions: codes})
	}
	return out, nil
}

// CreateRole inserts a new role with no grants. Code is normalized to upper
// snake so matrix-created roles match the seeded catalogue style.
func (a *RoleAdmin) CreateRole(ctx context.Context, code, name string) (*domain.Role, error) {
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
	return a.roles.CreateRole(ctx, code, name)
}

// ReplaceGrants overwrites one role's permission set. Unknown codes 400.
func (a *RoleAdmin) ReplaceGrants(ctx context.Context, roleID int, codes []string) error {
	if _, err := a.roles.GetByID(ctx, roleID); err != nil {
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

	return a.roles.ReplaceRolePermissions(ctx, roleID, ids)
}
