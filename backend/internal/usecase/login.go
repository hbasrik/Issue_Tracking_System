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
// against users.password_hash. All failure modes collapse to
// domain.ErrInvalidCredentials so the caller cannot enumerate valid emails.
func (a *Authenticator) Login(ctx context.Context, email, password string) (*domain.User, error) {
	user, err := a.users.GetByEmail(ctx, email)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return nil, domain.ErrInvalidCredentials
		}
		return nil, err
	}
	if !user.IsActive {
		return nil, domain.ErrInvalidCredentials
	}
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		return nil, domain.ErrInvalidCredentials
	}
	return user, nil
}
