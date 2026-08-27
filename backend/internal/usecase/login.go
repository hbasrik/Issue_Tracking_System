package usecase

import (
	"context"
	"errors"

	"golang.org/x/crypto/bcrypt"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/repository"
)

// Authenticator verifies user credentials for the login endpoint.
type Authenticator struct {
	users repository.UserRepository
}

// NewAuthenticator wires the usecase with its repository.
func NewAuthenticator(users repository.UserRepository) *Authenticator {
	return &Authenticator{users: users}
}

// Login verifies an email/password pair against the stored bcrypt hash and
// returns the authenticated user. The plaintext password is never compared
// directly; bcrypt.CompareHashAndPassword does a constant-time comparison
// against users.password_hash. Unknown emails and wrong passwords collapse to
// domain.ErrInvalidCredentials so callers cannot enumerate valid emails. A
// correct password on a deactivated user or role returns
// domain.ErrAccountInactive instead, so the failure is not mistaken for a
// credential error and no token is issued.
func (a *Authenticator) Login(ctx context.Context, email, password string) (*domain.User, error) {
	user, err := a.users.GetByEmail(ctx, email)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return nil, domain.ErrInvalidCredentials
		}
		return nil, err
	}
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		return nil, domain.ErrInvalidCredentials
	}
	if !user.IsActive || !user.Role.IsActive {
		return nil, domain.ErrAccountInactive
	}
	return user, nil
}

// ChangePassword replaces the caller's password after verifying the current
// one. A successful change clears must_change_password.
func (a *Authenticator) ChangePassword(ctx context.Context, userID int, current, newPassword, confirm string) error {
	if newPassword != confirm {
		return domain.ErrPasswordMismatch
	}
	if err := domain.ValidatePassword(newPassword); err != nil {
		return err
	}
	user, err := a.users.GetByID(ctx, userID)
	if err != nil {
		return err
	}
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(current)); err != nil {
		return domain.ErrInvalidCredentials
	}
	hash, err := hashPassword(newPassword)
	if err != nil {
		return err
	}
	return a.users.UpdatePassword(ctx, userID, hash, false)
}

// GetByID returns the user row for middleware that needs must_change_password.
func (a *Authenticator) GetByID(ctx context.Context, id int) (*domain.User, error) {
	return a.users.GetByID(ctx, id)
}
