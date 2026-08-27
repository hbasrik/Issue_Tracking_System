package usecase

import (
	"context"
	"errors"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/repository"
)

// UserAdmin lists users and updates role / is_active under self-lockout and
// last-admin.manage_users invariants. Authorization to call these methods is
// admin.manage_users at the route; the rules below keep Users & Roles reachable.
type UserAdmin struct {
	users repository.UserRepository
	roles repository.RoleRepository
}

// NewUserAdmin wires the usecase with its repositories.
func NewUserAdmin(users repository.UserRepository, roles repository.RoleRepository) *UserAdmin {
	return &UserAdmin{users: users, roles: roles}
}

// UpdateUserInput is a partial update. At least one field must be set by the
// HTTP adapter; an empty update is a no-op here.
type UpdateUserInput struct {
	Role     *string
	IsActive *bool
}

// List returns every user. Callers must not serialize PasswordHash.
func (a *UserAdmin) List(ctx context.Context) ([]domain.User, error) {
	return a.users.List(ctx)
}

// Update applies a role and/or is_active change.
//
// Order of checks:
//  1. The last active holder of admin.manage_users cannot be demoted or
//     deactivated (409).
//  2. A user cannot change their own role or deactivate themselves (403).
func (a *UserAdmin) Update(ctx context.Context, actorID, targetID int, in UpdateUserInput) (*domain.User, error) {
	target, err := a.users.GetByID(ctx, targetID)
	if err != nil {
		return nil, err
	}

	newRole := target.Role
	if in.Role != nil && *in.Role != target.Role.Code {
		role, err := a.roles.GetByCode(ctx, *in.Role)
		if err != nil {
			if errors.Is(err, domain.ErrNotFound) {
				return nil, domain.ErrInvalidEnumValue
			}
			return nil, err
		}
		newRole = *role
	}

	newActive := target.IsActive
	if in.IsActive != nil {
		newActive = *in.IsActive
	}

	roleChanging := newRole.Code != target.Role.Code
	deactivating := target.IsActive && !newActive
	if !roleChanging && newActive == target.IsActive {
		return target, nil
	}

	wasHolder, err := isUserAdminHolder(ctx, a.roles, target.IsActive, target.Role)
	if err != nil {
		return nil, err
	}
	willHold, err := isUserAdminHolder(ctx, a.roles, newActive, newRole)
	if err != nil {
		return nil, err
	}
	if wasHolder && !willHold {
		n, err := a.users.CountActiveUsersWithPermission(ctx, domain.PermissionAdminManageUsers)
		if err != nil {
			return nil, err
		}
		if n <= 1 {
			return nil, domain.ErrLastActiveManager
		}
	}

	if actorID == targetID {
		if roleChanging {
			return nil, domain.ErrCannotChangeOwnRole
		}
		if deactivating {
			return nil, domain.ErrCannotDeactivateSelf
		}
	}

	if err := a.users.UpdateRoleAndActive(ctx, targetID, newRole.ID, newActive); err != nil {
		return nil, err
	}
	return a.users.GetByID(ctx, targetID)
}

// CreateUserInput is the admin create-user form.
type CreateUserInput struct {
	FullName string
	Email    string
	Role     string
}

// CreatedUser is the stored user plus the one-time plaintext password. The
// password must not be logged and is omitted from later GETs.
type CreatedUser struct {
	User              *domain.User
	TemporaryPassword string
}

// Create inserts an active user with a generated password and
// must_change_password set. Duplicate emails return ErrEmailTaken.
func (a *UserAdmin) Create(ctx context.Context, in CreateUserInput) (*CreatedUser, error) {
	name := normalizeFullName(in.FullName)
	if name == "" {
		return nil, domain.ErrFullNameRequired
	}
	email := normalizeEmail(in.Email)
	if email == "" {
		return nil, domain.ErrEmailRequired
	}
	role, err := a.roles.GetByCode(ctx, in.Role)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return nil, domain.ErrInvalidEnumValue
		}
		return nil, err
	}
	if existing, err := a.users.GetByEmail(ctx, email); err == nil && existing != nil {
		return nil, domain.ErrEmailTaken
	} else if err != nil && !errors.Is(err, domain.ErrNotFound) {
		return nil, err
	}

	plain, err := generateTemporaryPassword()
	if err != nil {
		return nil, err
	}
	hash, err := hashPassword(plain)
	if err != nil {
		return nil, err
	}
	stored, err := a.users.Create(ctx, &domain.User{
		FullName:           name,
		Email:              email,
		PasswordHash:       hash,
		Role:               *role,
		IsActive:           true,
		MustChangePassword: true,
	})
	if err != nil {
		return nil, err
	}
	return &CreatedUser{User: stored, TemporaryPassword: plain}, nil
}

// ResetPasswordInput is unused; the target is identified by id.
// ResetPassword generates a new one-time password, sets must_change_password,
// and refuses when the actor targets themselves.
func (a *UserAdmin) ResetPassword(ctx context.Context, actorID, targetID int) (string, error) {
	if actorID == targetID {
		return "", domain.ErrCannotResetOwnPassword
	}
	if _, err := a.users.GetByID(ctx, targetID); err != nil {
		return "", err
	}
	plain, err := generateTemporaryPassword()
	if err != nil {
		return "", err
	}
	hash, err := hashPassword(plain)
	if err != nil {
		return "", err
	}
	if err := a.users.UpdatePassword(ctx, targetID, hash, true); err != nil {
		return "", err
	}
	return plain, nil
}

func isUserAdminHolder(ctx context.Context, roles repository.RoleRepository, active bool, role domain.Role) (bool, error) {
	if !active || !role.IsActive {
		return false, nil
	}
	return roleHasPermission(ctx, roles, role.ID, domain.PermissionAdminManageUsers)
}

func roleHasPermission(ctx context.Context, roles repository.RoleRepository, roleID int, code string) (bool, error) {
	granted, err := roles.GetPermissionsForRole(ctx, roleID)
	if err != nil {
		return false, err
	}
	for _, p := range granted {
		if p.Code == code {
			return true, nil
		}
	}
	return false, nil
}
