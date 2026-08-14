package postgres

import (
	"context"

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
