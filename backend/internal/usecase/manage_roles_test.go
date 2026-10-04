package usecase_test

import (
	"context"
	"errors"
	"testing"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/repository"
	"github.com/karea/backend/internal/usecase"
)

var _ repository.RoleRepository = (*matrixRoleRepo)(nil)
var _ repository.UserRepository = (*matrixUserRepo)(nil)

type matrixRoleRepo struct {
	roles       map[int]*domain.Role
	permissions []domain.Permission
	grants      map[int][]int
	nextID      int
}

func newMatrixRoleRepo() *matrixRoleRepo {
	return &matrixRoleRepo{
		roles: map[int]*domain.Role{
			1: {ID: 1, Code: domain.RoleCodeOperator, Name: "Operator", IsActive: true},
			2: {ID: 2, Code: domain.RoleCodeManagerAdmin, Name: "Manager/Admin", IsActive: true},
		},
		permissions: []domain.Permission{
			{ID: 1, Code: domain.PermissionAdminManageUsers},
			{ID: 2, Code: domain.PermissionVehicleView},
			{ID: 3, Code: domain.PermissionIssueView},
		},
		grants: map[int][]int{
			1: {2, 3},
			2: {1, 2, 3},
		},
		nextID: 3,
	}
}

func (r *matrixRoleRepo) GetPermissionsForUser(context.Context, int) ([]domain.Permission, error) {
	return nil, nil
}

func (r *matrixRoleRepo) GetByCode(_ context.Context, code string) (*domain.Role, error) {
	for _, role := range r.roles {
		if role.Code == code {
			copied := *role
			return &copied, nil
		}
	}
	return nil, domain.ErrNotFound
}

func (r *matrixRoleRepo) GetByID(_ context.Context, id int) (*domain.Role, error) {
	role, ok := r.roles[id]
	if !ok {
		return nil, domain.ErrNotFound
	}
	copied := *role
	return &copied, nil
}

func (r *matrixRoleRepo) ListRoles(context.Context) ([]domain.Role, error) {
	out := make([]domain.Role, 0, len(r.roles))
	for _, role := range r.roles {
		out = append(out, *role)
	}
	return out, nil
}

func (r *matrixRoleRepo) ListPermissions(context.Context) ([]domain.Permission, error) {
	return append([]domain.Permission{}, r.permissions...), nil
}

func (r *matrixRoleRepo) GetPermissionsForRole(_ context.Context, roleID int) ([]domain.Permission, error) {
	ids := r.grants[roleID]
	out := make([]domain.Permission, 0, len(ids))
	for _, id := range ids {
		for _, p := range r.permissions {
			if p.ID == id {
				out = append(out, p)
			}
		}
	}
	return out, nil
}

func (r *matrixRoleRepo) ReplaceRolePermissions(_ context.Context, roleID int, permissionIDs []int) error {
	r.grants[roleID] = append([]int{}, permissionIDs...)
	return nil
}

func (r *matrixRoleRepo) CreateRole(_ context.Context, code, name string) (*domain.Role, error) {
	id := r.nextID
	r.nextID++
	role := &domain.Role{ID: id, Code: code, Name: name, IsActive: true}
	r.roles[id] = role
	r.grants[id] = []int{}
	copied := *role
	return &copied, nil
}

func (r *matrixRoleRepo) CountRolesWithPermissionExcept(_ context.Context, code string, roleID int) (int, error) {
	n := 0
	for id, ids := range r.grants {
		if id == roleID {
			continue
		}
		for _, pid := range ids {
			for _, p := range r.permissions {
				if p.ID == pid && p.Code == code {
					n++
				}
			}
		}
	}
	return n, nil
}

type matrixUserRepo struct {
	holders map[int]int
}

func (matrixUserRepo) GetByEmail(context.Context, string) (*domain.User, error) {
	return nil, domain.ErrNotFound
}
func (matrixUserRepo) GetByID(context.Context, int) (*domain.User, error) {
	return nil, domain.ErrNotFound
}
func (matrixUserRepo) List(context.Context) ([]domain.User, error) { return nil, nil }
func (matrixUserRepo) UpdateRoleAndActive(context.Context, int, int, bool) error {
	return nil
}
func (r matrixUserRepo) CountActiveUsersWithPermission(context.Context, string) (int, error) {
	n := 0
	for _, c := range r.holders {
		n += c
	}
	return n, nil
}
func (r matrixUserRepo) CountActiveUsersWithPermissionExceptRole(_ context.Context, _ string, roleID int) (int, error) {
	n := 0
	for id, c := range r.holders {
		if id != roleID {
			n += c
		}
	}
	return n, nil
}

func (matrixUserRepo) Create(_ context.Context, user *domain.User) (*domain.User, error) {
	copied := *user
	return &copied, nil
}

func (matrixUserRepo) UpdatePassword(context.Context, int, string, bool) error {
	return nil
}

func (matrixUserRepo) UpdatePasswordHash(context.Context, int, string) error {
	return nil
}

func (matrixUserRepo) CountReferences(context.Context, int) (int, error) { return 0, nil }

func (matrixUserRepo) Delete(context.Context, int) error { return nil }

func TestRoleAdmin_CannotStripLastUserAdminGrant(t *testing.T) {
	roles := newMatrixRoleRepo()
	audit := newFakeAuditRepo()
	admin := usecase.NewRoleAdmin(roles, matrixUserRepo{holders: map[int]int{2: 1}}, audit, nil)

	err := admin.ReplaceGrants(context.Background(), 9, 2, []string{domain.PermissionVehicleView})
	if !errors.Is(err, domain.ErrLastActiveManager) {
		t.Fatalf("err = %v, want ErrLastActiveManager", err)
	}
	if n := len(audit.Entries()); n != 0 {
		t.Fatalf("rejected change wrote %d audit rows", n)
	}
}

func TestRoleAdmin_CanStripWhenAnotherRoleHoldsIt(t *testing.T) {
	roles := newMatrixRoleRepo()
	roles.grants[1] = []int{1, 2, 3}
	audit := newFakeAuditRepo()
	admin := usecase.NewRoleAdmin(roles, matrixUserRepo{holders: map[int]int{1: 1, 2: 1}}, audit, nil)

	if err := admin.ReplaceGrants(context.Background(), 9, 2, []string{domain.PermissionVehicleView}); err != nil {
		t.Fatalf("ReplaceGrants: %v", err)
	}
	entries := audit.Entries()
	if len(entries) != 1 {
		t.Fatalf("audit rows = %d, want 1", len(entries))
	}
	e := entries[0]
	if e.EventType != domain.AuditEventRolePermission || e.VIN != "" || e.PerformedBy == nil || *e.PerformedBy != 9 {
		t.Fatalf("entry = %+v", e)
	}
	revoked, _ := e.Metadata["revoked"].([]any)
	if e.Metadata["action"] != domain.AdminActionGrantsChange || len(revoked) != 2 || e.Metadata["granted"] != nil {
		t.Fatalf("metadata = %v", e.Metadata)
	}
	first, _ := revoked[0].(map[string]any)
	if first["code"] != domain.PermissionAdminManageUsers {
		t.Fatalf("revoked = %v, want sorted codes", revoked)
	}
}

func TestRoleAdmin_UnchangedGrantsWriteNoAudit(t *testing.T) {
	roles := newMatrixRoleRepo()
	audit := newFakeAuditRepo()
	admin := usecase.NewRoleAdmin(roles, matrixUserRepo{}, audit, nil)
	if err := admin.ReplaceGrants(context.Background(), 9, 1,
		[]string{domain.PermissionIssueView, domain.PermissionVehicleView}); err != nil {
		t.Fatalf("ReplaceGrants: %v", err)
	}
	if n := len(audit.Entries()); n != 0 {
		t.Fatalf("audit rows = %d, want 0", n)
	}
}

func TestRoleAdmin_CreateRole(t *testing.T) {
	roles := newMatrixRoleRepo()
	audit := newFakeAuditRepo()
	admin := usecase.NewRoleAdmin(roles, matrixUserRepo{}, audit, nil)

	role, err := admin.CreateRole(context.Background(), 9, "shift_lead", "Shift Lead")
	if err != nil {
		t.Fatalf("CreateRole: %v", err)
	}
	if role.Code != "SHIFT_LEAD" {
		t.Fatalf("code = %q", role.Code)
	}
	entries := audit.Entries()
	if len(entries) != 1 || entries[0].Metadata["action"] != domain.AdminActionCreate {
		t.Fatalf("audit = %+v", entries)
	}
	subject, _ := entries[0].Metadata["subject"].(map[string]any)
	if subject["code"] != "SHIFT_LEAD" || subject["tr"] != "Shift Lead" {
		t.Fatalf("subject = %v", subject)
	}
}

func TestRoleAdmin_CreateRoleInvalidCode(t *testing.T) {
	admin := usecase.NewRoleAdmin(newMatrixRoleRepo(), matrixUserRepo{}, nil, nil)
	if _, err := admin.CreateRole(context.Background(), 9, "bad-code", "Bad"); !errors.Is(err, domain.ErrInvalidEnumValue) {
		t.Fatalf("err = %v", err)
	}
}
