package domain_test

import (
	"errors"
	"testing"

	"github.com/karea/backend/internal/domain"
)

func TestValidateEmail(t *testing.T) {
	t.Parallel()
	cases := []struct {
		in   string
		want error
	}{
		{"", domain.ErrEmailRequired},
		{"   ", domain.ErrEmailRequired},
		{"test@gmail", domain.ErrEmailInvalid},
		{"test@", domain.ErrEmailInvalid},
		{"@x.com", domain.ErrEmailInvalid},
		{"not-an-email", domain.ErrEmailInvalid},
		{"user@karea.local", nil},
		{"New.Op@Karea.local", nil},
		{"a@b.co", nil},
	}
	for _, c := range cases {
		err := domain.ValidateEmail(c.in)
		if !errors.Is(err, c.want) {
			t.Errorf("ValidateEmail(%q) = %v, want %v", c.in, err, c.want)
		}
	}
}

func TestCheckAllowedEmailDomain_EmptyAllowsAny(t *testing.T) {
	t.Parallel()
	if err := domain.CheckAllowedEmailDomain("anyone@gmail.com", nil); err != nil {
		t.Fatalf("nil list: %v", err)
	}
	if err := domain.CheckAllowedEmailDomain("anyone@gmail.com", []string{}); err != nil {
		t.Fatalf("empty list: %v", err)
	}
}

func TestCheckAllowedEmailDomain_RejectsUnknown(t *testing.T) {
	t.Parallel()
	allowed := []string{"karea.local"}
	err := domain.CheckAllowedEmailDomain("user@gmail.com", allowed)
	var denied *domain.EmailDomainNotAllowedError
	if !errors.As(err, &denied) {
		t.Fatalf("err = %v, want EmailDomainNotAllowedError", err)
	}
	if err.Error() != "email domain is not allowed; accepted domains: karea.local" {
		t.Errorf("message = %q", err.Error())
	}
	if err := domain.CheckAllowedEmailDomain("op@karea.local", allowed); err != nil {
		t.Fatalf("allowed domain: %v", err)
	}
}

func TestNormalizeEmailDomains(t *testing.T) {
	t.Parallel()
	got := domain.NormalizeEmailDomains([]string{" Karea.local ", "@karea.com", "karea.local", "", " "})
	if len(got) != 2 || got[0] != "karea.local" || got[1] != "karea.com" {
		t.Fatalf("got %#v", got)
	}
}
