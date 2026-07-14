package repository

import "context"

// TransactionManager runs a function inside a single database transaction.
// Implementations (e.g. postgres.UnitOfWork) store the pgx.Tx on the context
// passed to fn so repositories can participate in the same transaction.
type TransactionManager interface {
	// WithinTx begins a transaction, calls fn with a context carrying the tx,
	// and commits on success or rolls back if fn returns an error.
	WithinTx(ctx context.Context, fn func(ctx context.Context) error) error
}
