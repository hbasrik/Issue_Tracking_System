package postgres

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
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
	   r.id, r.code, r.name, r.is_active, u.is_active, u.must_change_password, u.created_at
	  FROM users u
	  JOIN roles r ON r.id = u.role_id`

func scanUser(row pgx.Row) (*domain.User, error) {
	var u domain.User
	if err := row.Scan(&u.ID, &u.FullName, &u.Email, &u.PasswordHash,
		&u.Role.ID, &u.Role.Code, &u.Role.Name, &u.Role.IsActive, &u.IsActive,
		&u.MustChangePassword, &u.CreatedAt); err != nil {
		return nil, err
	}
	return &u, nil
}

// GetByEmail returns the user with the given email.
func (r *UserRepo) GetByEmail(ctx context.Context, email string) (*domain.User, error) {
	row := r.pool.QueryRow(ctx, userSelect+` WHERE lower(u.email) = lower($1)`, email)
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

// CountActiveUsersWithPermission counts active users whose role grants code.
func (r *UserRepo) CountActiveUsersWithPermission(ctx context.Context, permissionCode string) (int, error) {
	var n int
	err := r.pool.QueryRow(ctx,
		`SELECT COUNT(*)
		   FROM users u
		   JOIN roles r ON r.id = u.role_id
		   JOIN role_permissions rp ON rp.role_id = r.id
		   JOIN permissions p ON p.id = rp.permission_id
		  WHERE u.is_active AND r.is_active AND p.code = $1`,
		permissionCode).Scan(&n)
	return n, err
}

// CountActiveUsersWithPermissionExceptRole excludes one role from the count.
func (r *UserRepo) CountActiveUsersWithPermissionExceptRole(ctx context.Context, permissionCode string, roleID int) (int, error) {
	var n int
	err := r.pool.QueryRow(ctx,
		`SELECT COUNT(*)
		   FROM users u
		   JOIN roles r ON r.id = u.role_id
		   JOIN role_permissions rp ON rp.role_id = r.id
		   JOIN permissions p ON p.id = rp.permission_id
		  WHERE u.is_active AND r.is_active AND p.code = $1 AND r.id <> $2`,
		permissionCode, roleID).Scan(&n)
	return n, err
}

// Create inserts a user. Duplicate emails surface as domain.ErrEmailTaken
// rather than a unique-violation 500.
func (r *UserRepo) Create(ctx context.Context, user *domain.User) (*domain.User, error) {
	var id int
	err := r.pool.QueryRow(ctx,
		`INSERT INTO users (full_name, email, password_hash, role_id, is_active, must_change_password)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 RETURNING id`,
		user.FullName, user.Email, user.PasswordHash, user.Role.ID, user.IsActive, user.MustChangePassword,
	).Scan(&id)
	if err != nil {
		return nil, mapUniqueEmail(err)
	}
	return r.GetByID(ctx, id)
}

// UpdatePassword replaces the hash and the must-change flag.
func (r *UserRepo) UpdatePassword(ctx context.Context, id int, passwordHash string, mustChange bool) error {
	tag, err := r.pool.Exec(ctx,
		`UPDATE users SET password_hash = $2, must_change_password = $3 WHERE id = $1`,
		id, passwordHash, mustChange)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrNotFound
	}
	return nil
}

func mapUniqueEmail(err error) error {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		return domain.ErrEmailTaken
	}
	return err
}
