package usecase

import (
	"crypto/rand"
	"fmt"
	"strings"
	"unicode"

	"golang.org/x/crypto/bcrypt"

	"github.com/karea/backend/internal/domain"
)

const bcryptCost = bcrypt.DefaultCost

const tempPasswordLen = 12

// charset omits ambiguous 0/O/1/l/I so a manager can read the one-time password.
const tempAlphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"

func hashPassword(plain string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(plain), bcryptCost)
	if err != nil {
		return "", err
	}
	return string(hash), nil
}

func normalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

func normalizeFullName(name string) string {
	return strings.TrimSpace(name)
}

// generateTemporaryPassword returns a value that always satisfies
// domain.ValidatePassword. The plaintext is only returned to the caller of
// Create/ResetPassword; it is never logged.
func generateTemporaryPassword() (string, error) {
	buf := make([]byte, tempPasswordLen)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("generate password: %w", err)
	}
	out := make([]byte, tempPasswordLen)
	for i, b := range buf {
		out[i] = tempAlphabet[int(b)%len(tempAlphabet)]
	}
	hasLetter, hasDigit := false, false
	for _, r := range string(out) {
		if unicode.IsLetter(r) {
			hasLetter = true
		}
		if unicode.IsDigit(r) {
			hasDigit = true
		}
	}
	if !hasLetter {
		out[0] = 'A'
	}
	if !hasDigit {
		out[1] = '2'
	}
	plain := string(out)
	if err := domain.ValidatePassword(plain); err != nil {
		return "", err
	}
	return plain, nil
}
