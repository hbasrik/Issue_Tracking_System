package domain_test

import (
	"errors"
	"testing"

	"github.com/karea/backend/internal/domain"
)

func TestValidatePassword(t *testing.T) {
	t.Parallel()
	cases := []struct {
		in   string
		want error
	}{
		{"short1A", domain.ErrPasswordTooShort},
		{"abcdefgh", domain.ErrPasswordTooWeak},
		{"12345678", domain.ErrPasswordTooWeak},
		{"changeme123", nil},
		{"Abcdefg1", nil},
	}
	for _, c := range cases {
		err := domain.ValidatePassword(c.in)
		if !errors.Is(err, c.want) {
			t.Errorf("ValidatePassword(%q) = %v, want %v", c.in, err, c.want)
		}
	}
}
