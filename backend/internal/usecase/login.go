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
