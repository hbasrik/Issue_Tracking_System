package usecase_test

import (
	"context"
	"errors"
	"sort"
	"testing"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/repository"
	"github.com/karea/backend/internal/usecase"
)

var (
	_ repository.UserRepository = (*adminUserRepo)(nil)
	_ repository.RoleRepository = (*adminRoleRepo)(nil)
)

var (
	operatorRole = domain.Role{ID: 1, Code: domain.RoleCodeOperator, Name: "Operator", IsActive: true}
	managerRole  = domain.Role{ID: 2, Code: domain.RoleCodeManagerAdmin, Name: "Manager/Admin", IsActive: true}
)

type adminUserRepo struct {
	users map[int]*domain.User
}

func (r *adminUserRepo) GetByEmail(context.Context, string) (*domain.User, error) {
	return nil, domain.ErrNotFound
}

func (r *adminUserRepo) GetByID(_ context.Context, id int) (*domain.User, error) {
	user, ok := r.users[id]
	if !ok {
		return nil, domain.ErrNotFound
	}
	copied := *user
	return &copied, nil
}

func (r *adminUserRepo) List(context.Context) ([]domain.User, error) {
	ids := make([]int, 0, len(r.users))
	for id := range r.users {
		ids = append(ids, id)
	}
	sort.Ints(ids)
	out := make([]domain.User, 0, len(ids))
	for _, id := range ids {
		out = append(out, *r.users[id])
	}
	return out, nil
}

func (r *adminUserRepo) UpdateRoleAndActive(_ context.Context, id, roleID int, isActive bool) error {
	user, ok := r.users[id]
	if !ok {
		return domain.ErrNotFound
	}
	switch roleID {
	case operatorRole.ID:
		user.Role = operatorRole
	case managerRole.ID:
		user.Role = managerRole
	default:
		return domain.ErrNotFound
	}
	user.IsActive = isActive
	return nil
}

func (r *adminUserRepo) CountActiveUsersWithPermission(_ context.Context, code string) (int, error) {
	if code != domain.PermissionAdminManageUsers {
		return 0, nil
	}
	n := 0
	for _, user := range r.users {
		if user.IsActive && user.Role.IsActive && user.Role.ID == managerRole.ID {
			n++
		}
	}
	return n, nil
}

func (r *adminUserRepo) CountActiveUsersWithPermissionExceptRole(_ context.Context, code string, roleID int) (int, error) {
	if code != domain.PermissionAdminManageUsers {
		return 0, nil
	}
	n := 0
	for _, user := range r.users {
		if user.IsActive && user.Role.IsActive && user.Role.ID == managerRole.ID && user.Role.ID != roleID {
			n++
		}
	}
	return n, nil
}

type adminRoleRepo struct{}

func (adminRoleRepo) GetPermissionsForUser(context.Context, int) ([]domain.Permission, error) {
	return nil, nil
}

func (adminRoleRepo) GetByCode(_ context.Context, code string) (*domain.Role, error) {
	switch code {
	case domain.RoleCodeOperator:
		copied := operatorRole
		return &copied, nil
	case domain.RoleCodeManagerAdmin:
		copied := managerRole
		return &copied, nil
	default:
		return nil, domain.ErrNotFound
	}
}

func (adminRoleRepo) GetByID(_ context.Context, id int) (*domain.Role, error) {
	switch id {
	case operatorRole.ID:
		copied := operatorRole
		return &copied, nil
	case managerRole.ID:
		copied := managerRole
		return &copied, nil
	default:
		return nil, domain.ErrNotFound
	}
}

func (adminRoleRepo) ListRoles(context.Context) ([]domain.Role, error) {
	return []domain.Role{operatorRole, managerRole}, nil
}

func (adminRoleRepo) ListPermissions(context.Context) ([]domain.Permission, error) {
	return []domain.Permission{{ID: 1, Code: domain.PermissionAdminManageUsers}}, nil
}

func (adminRoleRepo) GetPermissionsForRole(_ context.Context, roleID int) ([]domain.Permission, error) {
	if roleID == managerRole.ID {
		return []domain.Permission{{Code: domain.PermissionAdminManageUsers}}, nil
	}
	return []domain.Permission{}, nil
}

func (adminRoleRepo) ReplaceRolePermissions(context.Context, int, []int) error {
	return nil
}

func (adminRoleRepo) CreateRole(context.Context, string, string) (*domain.Role, error) {
	return nil, domain.ErrNotFound
}

func (adminRoleRepo) CountRolesWithPermissionExcept(_ context.Context, code string, roleID int) (int, error) {
	if code == domain.PermissionAdminManageUsers && roleID != managerRole.ID {
		return 1, nil
	}
	return 0, nil
}

func ptr[T any](v T) *T { return &v }

func user(id int, role domain.Role, active bool) *domain.User {
	return &domain.User{
		ID:       id,
		Email:    "user@karea.local",
		Role:     role,
		IsActive: active,
	}
}

func newAdmin(users ...*domain.User) *usecase.UserAdmin {
	byID := make(map[int]*domain.User, len(users))
	for _, u := range users {
		copied := *u
		byID[u.ID] = &copied
	}
	return usecase.NewUserAdmin(&adminUserRepo{users: byID}, adminRoleRepo{})
}

func TestUserAdmin_LastManagerCannotDemoteSelf(t *testing.T) {
	admin := newAdmin(user(1, managerRole, true), user(2, operatorRole, true))

	_, err := admin.Update(context.Background(), 1, 1, usecase.UpdateUserInput{
		Role: ptr(domain.RoleCodeOperator),
	})
	if !errors.Is(err, domain.ErrLastActiveManager) {
		t.Fatalf("err = %v, want ErrLastActiveManager", err)
	}
}

func TestUserAdmin_LastManagerCannotDeactivateSelf(t *testing.T) {
	admin := newAdmin(user(1, managerRole, true))

	_, err := admin.Update(context.Background(), 1, 1, usecase.UpdateUserInput{
		IsActive: ptr(false),
	})
	if !errors.Is(err, domain.ErrLastActiveManager) {
		t.Fatalf("err = %v, want ErrLastActiveManager", err)
	}
}

func TestUserAdmin_CannotChangeOwnRoleWhenAnotherManagerExists(t *testing.T) {
	admin := newAdmin(user(1, managerRole, true), user(2, managerRole, true))

	_, err := admin.Update(context.Background(), 1, 1, usecase.UpdateUserInput{
		Role: ptr(domain.RoleCodeOperator),
	})
	if !errors.Is(err, domain.ErrCannotChangeOwnRole) {
		t.Fatalf("err = %v, want ErrCannotChangeOwnRole", err)
	}
}

func TestUserAdmin_CannotDeactivateSelfWhenAnotherManagerExists(t *testing.T) {
	admin := newAdmin(user(1, managerRole, true), user(2, managerRole, true))

	_, err := admin.Update(context.Background(), 1, 1, usecase.UpdateUserInput{
		IsActive: ptr(false),
	})
	if !errors.Is(err, domain.ErrCannotDeactivateSelf) {
		t.Fatalf("err = %v, want ErrCannotDeactivateSelf", err)
	}
}

func TestUserAdmin_DemoteOtherManagerWhenPeerRemains(t *testing.T) {
	admin := newAdmin(user(1, managerRole, true), user(2, managerRole, true))

	got, err := admin.Update(context.Background(), 1, 2, usecase.UpdateUserInput{
		Role: ptr(domain.RoleCodeOperator),
	})
	if err != nil {
		t.Fatalf("Update: %v", err)
	}
	if got.Role.Code != domain.RoleCodeOperator {
		t.Fatalf("role = %q", got.Role.Code)
	}
}

func TestUserAdmin_PromoteOperator(t *testing.T) {
	admin := newAdmin(user(1, managerRole, true), user(2, operatorRole, true))

	got, err := admin.Update(context.Background(), 1, 2, usecase.UpdateUserInput{
		Role: ptr(domain.RoleCodeManagerAdmin),
	})
	if err != nil {
		t.Fatalf("Update: %v", err)
	}
	if got.Role.Code != domain.RoleCodeManagerAdmin {
		t.Fatalf("role = %q", got.Role.Code)
	}
}

func TestUserAdmin_LastManagerDemoteByOtherActor(t *testing.T) {
	admin := newAdmin(user(1, managerRole, true), user(2, operatorRole, true))

	_, err := admin.Update(context.Background(), 2, 1, usecase.UpdateUserInput{
		Role: ptr(domain.RoleCodeOperator),
	})
	if !errors.Is(err, domain.ErrLastActiveManager) {
		t.Fatalf("err = %v, want ErrLastActiveManager", err)
	}
}

func TestUserAdmin_UnknownRole(t *testing.T) {
	admin := newAdmin(user(1, managerRole, true), user(2, operatorRole, true))

	_, err := admin.Update(context.Background(), 1, 2, usecase.UpdateUserInput{
		Role: ptr("NOPE"),
	})
	if !errors.Is(err, domain.ErrInvalidEnumValue) {
		t.Fatalf("err = %v, want ErrInvalidEnumValue", err)
	}
}

func TestUserAdmin_MissingUser(t *testing.T) {
	admin := newAdmin(user(1, managerRole, true))

	_, err := admin.Update(context.Background(), 1, 99, usecase.UpdateUserInput{
		Role: ptr(domain.RoleCodeOperator),
	})
	if !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("err = %v, want ErrNotFound", err)
	}
}
