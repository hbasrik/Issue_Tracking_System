package postgres

import (
	"errors"

	"github.com/jackc/pgx/v5/pgconn"

	"github.com/karea/backend/internal/domain"
)

// mapRaiseException turns a PostgreSQL RAISE EXCEPTION (SQLSTATE P0001)
// into a domain error whose message is the trigger text, so hard-block
// gates enforced in the database surface as 409 instead of a generic 500.
func mapRaiseException(err error) error {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "P0001" {
		if pgErr.Message == domain.ErrDepotChecklistLocked.Error() {
			return domain.ErrDepotChecklistLocked
		}
		return &domain.DatabaseRejectedError{Message: pgErr.Message}
	}
	return err
}
