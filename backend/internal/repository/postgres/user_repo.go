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

const userColumns = `id, full_name, email, password_hash, role, is_active, created_at`

func scanUser(row pgx.Row) (*domain.User, error) {
	var u domain.User
	var role string
	if err := row.Scan(&u.ID, &u.FullName, &u.Email, &u.PasswordHash, &role, &u.IsActive, &u.CreatedAt); err != nil {
		return nil, err
	}
	u.Role = domain.UserRole(role)
	return &u, nil
}

// GetByEmail returns the user with the given email.
func (r *UserRepo) GetByEmail(ctx context.Context, email string) (*domain.User, error) {
	row := r.pool.QueryRow(ctx, `SELECT `+userColumns+` FROM users WHERE email = $1`, email)
	u, err := scanUser(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, domain.ErrNotFound
	}
	return u, err
}

// GetByID returns the user with the given ID.
func (r *UserRepo) GetByID(ctx context.Context, id int) (*domain.User, error) {
	row := r.pool.QueryRow(ctx, `SELECT `+userColumns+` FROM users WHERE id = $1`, id)
	u, err := scanUser(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, domain.ErrNotFound
	}
	return u, err
}
