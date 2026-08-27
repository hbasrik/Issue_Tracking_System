package domain

import (
	"fmt"
	"regexp"
	"strings"
)

// EmailRuleHint is the user-facing description of ValidateEmail.
const EmailRuleHint = "a valid address with a domain name and an extension (e.g. name@company.com)"

// local@host.tld — host must contain at least one dot and a 2+ letter TLD so
// addresses like "test@gmail" are rejected. Compared after Normalize-style
// lowercasing; Unicode / quoted locals are out of scope for this product.
var emailPattern = regexp.MustCompile(`^[a-z0-9._%+\-]+@[a-z0-9](?:[a-z0-9\-]*[a-z0-9])?(?:\.[a-z]{2,})+$`)

// ValidateEmail rejects empty and malformed addresses. It does not check the
// company-domain allowlist; that is CheckAllowedEmailDomain.
func ValidateEmail(email string) error {
	e := strings.ToLower(strings.TrimSpace(email))
	if e == "" {
		return ErrEmailRequired
	}
	if !emailPattern.MatchString(e) {
		return ErrEmailInvalid
	}
	return nil
}

// EmailDomain returns the lowercased host after @, or empty if @ is missing.
func EmailDomain(email string) string {
	e := strings.ToLower(strings.TrimSpace(email))
	i := strings.LastIndex(e, "@")
	if i < 0 || i == len(e)-1 {
		return ""
	}
	return e[i+1:]
}

// NormalizeEmailDomains lowercases, trims, drops empties/duplicates, and
// strips a leading @ so env values like "@karea.local" still match.
func NormalizeEmailDomains(raw []string) []string {
	seen := make(map[string]struct{}, len(raw))
	out := make([]string, 0, len(raw))
	for _, r := range raw {
		d := strings.ToLower(strings.TrimSpace(r))
		d = strings.TrimPrefix(d, "@")
		if d == "" {
			continue
		}
		if _, ok := seen[d]; ok {
			continue
		}
		seen[d] = struct{}{}
		out = append(out, d)
	}
	return out
}

// CheckAllowedEmailDomain is a no-op when allowed is empty (local/dev).
func CheckAllowedEmailDomain(email string, allowed []string) error {
	if len(allowed) == 0 {
		return nil
	}
	host := EmailDomain(email)
	for _, d := range allowed {
		if host == d {
			return nil
		}
	}
	return &EmailDomainNotAllowedError{Allowed: append([]string(nil), allowed...)}
}

// EmailDomainNotAllowedError lists the configured company domains in the
// message so the admin UI can show them without a second round-trip.
type EmailDomainNotAllowedError struct {
	Allowed []string
}

func (e *EmailDomainNotAllowedError) Error() string {
	if e == nil || len(e.Allowed) == 0 {
		return "email domain is not allowed"
	}
	return fmt.Sprintf("email domain is not allowed; accepted domains: %s", strings.Join(e.Allowed, ", "))
}
