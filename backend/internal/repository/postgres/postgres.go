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
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// NewPool creates a pgx connection pool from a PostgreSQL DSN. The pool is
// lazy: it does not open a connection until first use. appEnv is stamped onto
// every session as karea.app_env so development-only DB helpers (e.g.
// fn_ops_set_vehicle_status) can refuse to run outside APP_ENV=development.
func NewPool(ctx context.Context, dsn string, appEnv string) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, err
	}
	env := strings.TrimSpace(appEnv)
	cfg.AfterConnect = func(ctx context.Context, conn *pgx.Conn) error {
		_, err := conn.Exec(ctx,
			`SELECT set_config('karea.app_env', $1, false)`, env)
		return err
	}
	return pgxpool.NewWithConfig(ctx, cfg)
}
