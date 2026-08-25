package usecase

import (
	"context"
	"errors"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/repository"
)

// UserAdmin lists users and updates role / is_active under self-lockout and
// last-manager invariants. Authorization to call these methods is a route
// permission (admin.manage_masters); the rules below are extra safety so a
// manager cannot lock the tenant out of Users & Roles.
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
//  1. Last active MANAGER_ADMIN cannot be demoted or deactivated (409).
//  2. A user cannot change their own role or deactivate themselves (403).
//
// Checking the last-manager invariant first means the only remaining manager
// who tries to demote themselves gets the 409, not a generic self-lockout,
// so the client can tell the tenant why the write was refused.
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

	wasActiveManager := target.IsActive && target.Role.IsActive &&
		target.Role.Code == domain.RoleCodeManagerAdmin
	willBeActiveManager := newActive && newRole.IsActive &&
		newRole.Code == domain.RoleCodeManagerAdmin
	if wasActiveManager && !willBeActiveManager {
		n, err := a.users.CountActiveManagers(ctx)
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
