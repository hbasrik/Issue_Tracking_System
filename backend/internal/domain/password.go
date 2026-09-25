package domain

import (
	"strings"
	"unicode"
)

// MinPasswordLength is the shortest accepted password (letters counted as runes).
const MinPasswordLength = 8

// PasswordRuleHint is the user-facing description of ValidatePassword.
const PasswordRuleHint = "at least 8 characters, with a letter and a digit; not a common or personal password"

// passwordDenylist is matched case-insensitively as a substring (entries are
// already lowercase ASCII / Turkish fold). Keep it short: common leaks plus
// product-local guesses. MinPasswordLength is intentionally not raised —
// operators sign in daily from phones without a refresh token.
var passwordDenylist = []string{
	"password",
	"passwort",
	"changeme",
	"welcome",
	"letmein",
	"qwerty",
	"abc123",
	"iloveyou",
	"monkey",
	"dragon",
	"master",
	"login",
	"admin",
	"root",
	"football",
	"baseball",
	"princess",
	"123456",
	"1234567",
	"12345678",
	"123456789",
	"111111",
	"000000",
	"sifre",
	"şifre",
	"parola",
	"karea",
}

// ValidatePassword enforces the shared password rule for create, reset, and
// self-service change. email and fullName (when non-empty) block using the
// address local-part or name tokens as the password. It never logs or stores
// the value.
func ValidatePassword(password, email, fullName string) error {
	if len([]rune(password)) < MinPasswordLength {
		return ErrPasswordTooShort
	}
	hasLetter, hasDigit := false, false
	for _, r := range password {
		if unicode.IsLetter(r) {
			hasLetter = true
		}
		if unicode.IsDigit(r) {
			hasDigit = true
		}
	}
	if !hasLetter || !hasDigit {
		return ErrPasswordTooWeak
	}
	folded := foldPassword(password)
	for _, banned := range passwordDenylist {
		if strings.Contains(folded, banned) {
			return ErrPasswordTooCommon
		}
	}
	if personalPassword(folded, email, fullName) {
		return ErrPasswordPersonal
	}
	return nil
}

func foldPassword(s string) string {
	return strings.ToLower(strings.TrimSpace(s))
}

func personalPassword(foldedPassword, email, fullName string) bool {
	if local := emailLocalPart(email); len(local) >= 3 {
		if foldedPassword == local || strings.Contains(foldedPassword, local) {
			return true
		}
	}
	name := foldPassword(fullName)
	if name == "" {
		return false
	}
	compact := strings.Map(func(r rune) rune {
		if unicode.IsSpace(r) || r == '-' || r == '_' || r == '.' {
			return -1
		}
		return r
	}, name)
	if len([]rune(compact)) >= 3 && (foldedPassword == compact || strings.Contains(foldedPassword, compact)) {
		return true
	}
	for _, part := range strings.FieldsFunc(name, func(r rune) bool {
		return unicode.IsSpace(r) || r == '-' || r == '_' || r == '.'
	}) {
		if len([]rune(part)) >= 3 && (foldedPassword == part || strings.Contains(foldedPassword, part)) {
			return true
		}
	}
	return false
}

func emailLocalPart(email string) string {
	email = foldPassword(email)
	at := strings.IndexByte(email, '@')
	if at <= 0 {
		return ""
	}
	return email[:at]
}
