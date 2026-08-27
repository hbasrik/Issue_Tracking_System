package domain

import "unicode"

// MinPasswordLength is the shortest accepted password (letters counted as runes).
const MinPasswordLength = 8

// PasswordRuleHint is the user-facing description of ValidatePassword.
const PasswordRuleHint = "at least 8 characters, with at least one letter and one digit"

// ValidatePassword enforces the shared password rule for create, reset, and
// self-service change. It never logs or stores the value.
func ValidatePassword(password string) error {
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
		if hasLetter && hasDigit {
			return nil
		}
	}
	return ErrPasswordTooWeak
}
