package domain_test

import (
	"errors"
	"testing"

	"github.com/karea/backend/internal/domain"
)

func TestValidatePassword(t *testing.T) {
	t.Parallel()
	cases := []struct {
		in, email, name string
		want            error
	}{
		{"short1A", "", "", domain.ErrPasswordTooShort},
		{"abcdefgh", "", "", domain.ErrPasswordTooWeak},
		{"12345678", "", "", domain.ErrPasswordTooWeak},
		{"password1", "", "", domain.ErrPasswordTooCommon},
		{"Password1", "", "", domain.ErrPasswordTooCommon},
		{"changeme123", "", "", domain.ErrPasswordTooCommon},
		{"Karea2024", "", "", domain.ErrPasswordTooCommon},
		{"sifre1234", "", "", domain.ErrPasswordTooCommon},
		{"parola99", "", "", domain.ErrPasswordTooCommon},
		{"MySafe99", "op@karea.local", "", nil},
		{"operator1", "operator.one@karea.local", "Assembly Operator", domain.ErrPasswordPersonal},
		{"basri999", "basri@karea.local", "Quality Inspector", domain.ErrPasswordPersonal},
		{"inspector9", "quality@karea.local", "Quality Inspector", domain.ErrPasswordPersonal},
		{"Abcdefg1", "", "", nil},
		{"MySafe99", "", "", nil},
	}
	for _, c := range cases {
		err := domain.ValidatePassword(c.in, c.email, c.name)
		if !errors.Is(err, c.want) {
			t.Errorf("ValidatePassword(%q, %q, %q) = %v, want %v", c.in, c.email, c.name, err, c.want)
		}
	}
}
