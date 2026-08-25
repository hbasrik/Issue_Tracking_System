package postgres

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/repository"
)

// UserRepo is the Postgres-backed UserRepository.
type UserRepo struct {
	pool *pgxpool.Pool
}

// NewUserRepo constructs a UserRepo.
func NewUserRepo(pool *pgxpool.Pool) *UserRepo {
	return &UserRepo{pool: pool}
}

var _ repository.UserRepository = (*UserRepo)(nil)

// userSelect joins roles because the role is a foreign key row since migration
// 0002 (Karar 3), not an enum column on users.
const userSelect = `SELECT u.id, u.full_name, u.email, u.password_hash,
	   r.id, r.code, r.name, r.is_active, u.is_active, u.created_at
	  FROM users u
	  JOIN roles r ON r.id = u.role_id`

func scanUser(row pgx.Row) (*domain.User, error) {
	var u domain.User
	if err := row.Scan(&u.ID, &u.FullName, &u.Email, &u.PasswordHash,
		&u.Role.ID, &u.Role.Code, &u.Role.Name, &u.Role.IsActive, &u.IsActive, &u.CreatedAt); err != nil {
		return nil, err
	}
	return &u, nil
}

// GetByEmail returns the user with the given email.
func (r *UserRepo) GetByEmail(ctx context.Context, email string) (*domain.User, error) {
	row := r.pool.QueryRow(ctx, userSelect+` WHERE u.email = $1`, email)
	u, err := scanUser(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, domain.ErrNotFound
	}
	return u, err
}

// GetByID returns the user with the given ID.
func (r *UserRepo) GetByID(ctx context.Context, id int) (*domain.User, error) {
	row := r.pool.QueryRow(ctx, userSelect+` WHERE u.id = $1`, id)
	u, err := scanUser(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, domain.ErrNotFound
	}
	return u, err
}

// List returns every user ordered by id.
func (r *UserRepo) List(ctx context.Context) ([]domain.User, error) {
	rows, err := r.pool.Query(ctx, userSelect+` ORDER BY u.id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []domain.User
	for rows.Next() {
		u, err := scanUser(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *u)
	}
	if out == nil {
		out = []domain.User{}
	}
	return out, rows.Err()
}

// UpdateRoleAndActive assigns a role and is_active flag.
func (r *UserRepo) UpdateRoleAndActive(ctx context.Context, id, roleID int, isActive bool) error {
	tag, err := r.pool.Exec(ctx,
		`UPDATE users SET role_id = $2, is_active = $3 WHERE id = $1`,
		id, roleID, isActive)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrNotFound
	}
	return nil
}

// CountActiveManagers counts users who can currently sign in as MANAGER_ADMIN.
func (r *UserRepo) CountActiveManagers(ctx context.Context) (int, error) {
	var n int
	err := r.pool.QueryRow(ctx,
		`SELECT COUNT(*)
		   FROM users u
		   JOIN roles r ON r.id = u.role_id
		  WHERE u.is_active AND r.is_active AND r.code = $1`,
		domain.RoleCodeManagerAdmin).Scan(&n)
	return n, err
}
