// Package postgres provides PostgreSQL implementations of the repository
// interfaces.
//
// It uses jackc/pgx v5 (via pgxpool) directly rather than database/sql +
// sqlx. pgx is chosen because it speaks the native PostgreSQL wire protocol,
// has first-class support for the enum, JSONB, interval and array types used
// throughout this schema, and ships a high-performance connection pool — all
// without the lowest-common-denominator abstraction that database/sql imposes.
package postgres

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

// NewPool creates a pgx connection pool from a PostgreSQL DSN. The pool is
// lazy: it does not open a connection until first use.
func NewPool(ctx context.Context, dsn string) (*pgxpool.Pool, error) {
	return pgxpool.New(ctx, dsn)
}
