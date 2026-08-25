package usecase_test

import (
	"context"
	"errors"
	"testing"

	"golang.org/x/crypto/bcrypt"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/repository"
	"github.com/karea/backend/internal/usecase"
)

type fakeUserRepo struct {
	byEmail map[string]*domain.User
}

var _ repository.UserRepository = (*fakeUserRepo)(nil)

func (f *fakeUserRepo) GetByEmail(_ context.Context, email string) (*domain.User, error) {
	user, ok := f.byEmail[email]
	if !ok {
		return nil, domain.ErrNotFound
	}
	copied := *user
	return &copied, nil
}

func (f *fakeUserRepo) GetByID(context.Context, int) (*domain.User, error) {
	return nil, domain.ErrNotFound
}

func (f *fakeUserRepo) List(context.Context) ([]domain.User, error) {
	return nil, nil
}

func (f *fakeUserRepo) UpdateRoleAndActive(context.Context, int, int, bool) error {
	return nil
}

func (f *fakeUserRepo) CountActiveManagers(context.Context) (int, error) {
	return 0, nil
}

func mustHash(t *testing.T, password string) string {
	t.Helper()
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.MinCost)
	if err != nil {
		t.Fatalf("hash password: %v", err)
	}
	return string(hash)
}

func TestLogin_ActiveUserAndRole(t *testing.T) {
	authn := usecase.NewAuthenticator(&fakeUserRepo{byEmail: map[string]*domain.User{
		"op@karea.local": {
			ID:           1,
			Email:        "op@karea.local",
			PasswordHash: mustHash(t, "secret"),
			IsActive:     true,
			Role:         domain.Role{Code: domain.RoleCodeOperator, IsActive: true},
		},
	}})

	user, err := authn.Login(context.Background(), "op@karea.local", "secret")
	if err != nil {
		t.Fatalf("Login: %v", err)
	}
	if user.ID != 1 || user.Role.Code != domain.RoleCodeOperator {
		t.Fatalf("user = %+v", user)
	}
}

func TestLogin_InactiveRole_Rejected(t *testing.T) {
	authn := usecase.NewAuthenticator(&fakeUserRepo{byEmail: map[string]*domain.User{
		"op@karea.local": {
			ID:           1,
			Email:        "op@karea.local",
			PasswordHash: mustHash(t, "secret"),
			IsActive:     true,
			Role:         domain.Role{Code: domain.RoleCodeOperator, IsActive: false},
		},
	}})

	user, err := authn.Login(context.Background(), "op@karea.local", "secret")
	if user != nil {
		t.Fatalf("expected no user, got %+v", user)
	}
	if !errors.Is(err, domain.ErrAccountInactive) {
		t.Fatalf("err = %v, want ErrAccountInactive", err)
	}
}

func TestLogin_InactiveUser_Rejected(t *testing.T) {
	authn := usecase.NewAuthenticator(&fakeUserRepo{byEmail: map[string]*domain.User{
		"op@karea.local": {
			ID:           1,
			Email:        "op@karea.local",
			PasswordHash: mustHash(t, "secret"),
			IsActive:     false,
			Role:         domain.Role{Code: domain.RoleCodeOperator, IsActive: true},
		},
	}})

	user, err := authn.Login(context.Background(), "op@karea.local", "secret")
	if user != nil {
		t.Fatalf("expected no user, got %+v", user)
	}
	if !errors.Is(err, domain.ErrAccountInactive) {
		t.Fatalf("err = %v, want ErrAccountInactive", err)
	}
}

func TestLogin_InactiveRoleWrongPassword_LooksLikeBadCredentials(t *testing.T) {
	authn := usecase.NewAuthenticator(&fakeUserRepo{byEmail: map[string]*domain.User{
		"op@karea.local": {
			ID:           1,
			Email:        "op@karea.local",
			PasswordHash: mustHash(t, "secret"),
			IsActive:     true,
			Role:         domain.Role{Code: domain.RoleCodeOperator, IsActive: false},
		},
	}})

	_, err := authn.Login(context.Background(), "op@karea.local", "wrong")
	if !errors.Is(err, domain.ErrInvalidCredentials) {
		t.Fatalf("err = %v, want ErrInvalidCredentials", err)
	}
}

func TestLogin_UnknownEmail(t *testing.T) {
	authn := usecase.NewAuthenticator(&fakeUserRepo{byEmail: map[string]*domain.User{}})

	_, err := authn.Login(context.Background(), "missing@karea.local", "secret")
	if !errors.Is(err, domain.ErrInvalidCredentials) {
		t.Fatalf("err = %v, want ErrInvalidCredentials", err)
	}
}
