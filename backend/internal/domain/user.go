package domain

import "time"

// UserRole mirrors the user_role_enum type. Exactly two roles exist
// (Decision Log #4): OPERATOR is mobile-only, MANAGER_ADMIN is web-only.
type UserRole string

const (
	UserRoleOperator     UserRole = "OPERATOR"
	UserRoleManagerAdmin UserRole = "MANAGER_ADMIN"
)

// Valid reports whether the role is a known enum value.
func (r UserRole) Valid() bool {
	return r == UserRoleOperator || r == UserRoleManagerAdmin
}

// User mirrors the users table.
type User struct {
	ID       int
	FullName string
	Email    string
	Role     UserRole
	// PasswordHash is the bcrypt hash of the user's password. It is tagged
	// json:"-" so it is never serialized into an API response, and must never
	// be logged.
	PasswordHash string `json:"-"`
	IsActive     bool
	CreatedAt    time.Time
}
