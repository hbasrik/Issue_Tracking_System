package postgres

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/repository"
)

// RoleRepo is the Postgres-backed RoleRepository.
type RoleRepo struct {
	pool *pgxpool.Pool
}

// NewRoleRepo constructs a RoleRepo.
func NewRoleRepo(pool *pgxpool.Pool) *RoleRepo {
	return &RoleRepo{pool: pool}
}

var _ repository.RoleRepository = (*RoleRepo)(nil)

// GetPermissionsForUser resolves the user's effective permissions in one join
// across users -> roles -> role_permissions -> permissions. Inactive users and
// inactive roles grant nothing.
func (r *RoleRepo) GetPermissionsForUser(ctx context.Context, userID int) ([]domain.Permission, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT p.id, p.code
		   FROM users u
		   JOIN roles r ON r.id = u.role_id
		   JOIN role_permissions rp ON rp.role_id = r.id
		   JOIN permissions p ON p.id = rp.permission_id
		  WHERE u.id = $1 AND u.is_active AND r.is_active
		  ORDER BY p.code`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []domain.Permission
	for rows.Next() {
		var p domain.Permission
		if err := rows.Scan(&p.ID, &p.Code); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// GetByCode returns the role catalogue row for the given code.
func (r *RoleRepo) GetByCode(ctx context.Context, code string) (*domain.Role, error) {
	var role domain.Role
	err := r.pool.QueryRow(ctx,
		`SELECT id, code, name, is_active FROM roles WHERE code = $1`, code).
		Scan(&role.ID, &role.Code, &role.Name, &role.IsActive)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, domain.ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &role, nil
}

func scanRole(row pgx.Row) (*domain.Role, error) {
	var role domain.Role
	if err := row.Scan(&role.ID, &role.Code, &role.Name, &role.IsActive); err != nil {
		return nil, err
	}
	return &role, nil
}

// GetByID returns the role catalogue row for the given id.
func (r *RoleRepo) GetByID(ctx context.Context, id int) (*domain.Role, error) {
	role, err := scanRole(r.pool.QueryRow(ctx,
		`SELECT id, code, name, is_active FROM roles WHERE id = $1`, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, domain.ErrNotFound
	}
	return role, err
}

// ListRoles returns every role, id order.
func (r *RoleRepo) ListRoles(ctx context.Context) ([]domain.Role, error) {
	rows, err := r.pool.Query(ctx, `SELECT id, code, name, is_active FROM roles ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.Role
	for rows.Next() {
		role, err := scanRole(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *role)
	}
	if out == nil {
		out = []domain.Role{}
	}
	return out, rows.Err()
}

// ListPermissions returns the full permission catalogue, code order.
func (r *RoleRepo) ListPermissions(ctx context.Context) ([]domain.Permission, error) {
	rows, err := r.pool.Query(ctx, `SELECT id, code, COALESCE(description, '') FROM permissions ORDER BY code`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.Permission
	for rows.Next() {
		var p domain.Permission
		if err := rows.Scan(&p.ID, &p.Code, &p.Description); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	if out == nil {
		out = []domain.Permission{}
	}
	return out, rows.Err()
}

// GetPermissionsForRole returns the grants for one role.
func (r *RoleRepo) GetPermissionsForRole(ctx context.Context, roleID int) ([]domain.Permission, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT p.id, p.code, COALESCE(p.description, '')
		   FROM role_permissions rp
		   JOIN permissions p ON p.id = rp.permission_id
		  WHERE rp.role_id = $1
		  ORDER BY p.code`, roleID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.Permission
	for rows.Next() {
		var p domain.Permission
		if err := rows.Scan(&p.ID, &p.Code, &p.Description); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	if out == nil {
		out = []domain.Permission{}
	}
	return out, rows.Err()
}

// ReplaceRolePermissions overwrites the grant set for one role.
func (r *RoleRepo) ReplaceRolePermissions(ctx context.Context, roleID int, permissionIDs []int) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx, `DELETE FROM role_permissions WHERE role_id = $1`, roleID); err != nil {
		return err
	}
	for _, pid := range permissionIDs {
		if _, err := tx.Exec(ctx,
			`INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2)`,
			roleID, pid); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

// CreateRole inserts a new role with no grants.
func (r *RoleRepo) CreateRole(ctx context.Context, code, name string) (*domain.Role, error) {
	var role domain.Role
	err := r.pool.QueryRow(ctx,
		`INSERT INTO roles (code, name) VALUES ($1, $2)
		 RETURNING id, code, name, is_active`, code, name).
		Scan(&role.ID, &role.Code, &role.Name, &role.IsActive)
	if err != nil {
		return nil, err
	}
	return &role, nil
}

// CountRolesWithPermissionExcept counts other roles that still grant code.
func (r *RoleRepo) CountRolesWithPermissionExcept(ctx context.Context, permissionCode string, roleID int) (int, error) {
	var n int
	err := r.pool.QueryRow(ctx,
		`SELECT COUNT(*)
		   FROM roles r
		   JOIN role_permissions rp ON rp.role_id = r.id
		   JOIN permissions p ON p.id = rp.permission_id
		  WHERE p.code = $1 AND r.id <> $2`,
		permissionCode, roleID).Scan(&n)
	return n, err
}
