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
	   r.id, r.code, r.name, u.is_active, u.created_at
	  FROM users u
	  JOIN roles r ON r.id = u.role_id`

func scanUser(row pgx.Row) (*domain.User, error) {
	var u domain.User
	if err := row.Scan(&u.ID, &u.FullName, &u.Email, &u.PasswordHash,
		&u.Role.ID, &u.Role.Code, &u.Role.Name, &u.IsActive, &u.CreatedAt); err != nil {
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
