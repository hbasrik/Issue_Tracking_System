package postgres

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/karea/backend/internal/repository"
)

type txContextKey struct{}

// dbExecutor is the subset of pgxpool.Pool / pgx.Tx used by repositories.
// Both types satisfy this interface, which lets repos run against either the
// pool or an in-flight transaction without duplicating SQL.
type dbExecutor interface {
	Exec(ctx context.Context, sql string, arguments ...any) (pgconn.CommandTag, error)
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// UnitOfWork runs callbacks inside a shared pgx transaction (pgx v5 idiom:
// Begin → defer Rollback → fn → Commit).
type UnitOfWork struct {
	pool *pgxpool.Pool
}

// NewUnitOfWork constructs a UnitOfWork backed by the given pool.
func NewUnitOfWork(pool *pgxpool.Pool) *UnitOfWork {
	return &UnitOfWork{pool: pool}
}

var _ repository.TransactionManager = (*UnitOfWork)(nil)

// WithinTx begins a transaction, passes a context carrying the pgx.Tx to fn,
// commits on success, and rolls back on any returned error.
func (u *UnitOfWork) WithinTx(ctx context.Context, fn func(ctx context.Context) error) error {
	tx, err := u.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck // no-op after successful Commit

	txCtx := context.WithValue(ctx, txContextKey{}, tx)
	if err := fn(txCtx); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// executor returns the pgx.Tx stored on ctx when WithinTx is active, otherwise
// the connection pool.
func executor(ctx context.Context, pool *pgxpool.Pool) dbExecutor {
	if tx, ok := ctx.Value(txContextKey{}).(pgx.Tx); ok {
		return tx
	}
	return pool
}
