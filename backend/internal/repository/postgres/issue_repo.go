package postgres

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/repository"
)

// IssueRepo is the Postgres-backed IssueRepository.
type IssueRepo struct {
	pool *pgxpool.Pool
}

// NewIssueRepo constructs an IssueRepo.
func NewIssueRepo(pool *pgxpool.Pool) *IssueRepo {
	return &IssueRepo{pool: pool}
}

var _ repository.IssueRepository = (*IssueRepo)(nil)

const issueColumns = `i.id, i.vin, i.source_type, i.source_station_step_id, i.source_check_item_id, i.station_id,
	        i.issue_type_id, i.severity, i.description, COALESCE(i.picture_url, ''), i.status,
	        i.issue_reporter_id, i.issue_date, i.process_reporter_id, i.process_date,
	        i.finish_reporter_id, i.finish_date, i.approve_reporter_id, i.approve_date,
	        i.conditional_approve_reporter_id, i.conditional_approve_date,
	        COALESCE(i.issue_picture_done_url, ''), COALESCE(i.solution_description, ''),
	        i.created_at, i.updated_at, COALESCE(u.full_name, '')`

// scanIssue reads one issue row in issueColumns order (aliased as i.*, plus reporter name).
func scanIssue(row pgx.Row) (*domain.Issue, error) {
	var i domain.Issue
	var source, severity, status string
	if err := row.Scan(
		&i.ID, &i.VIN, &source, &i.SourceStationStepID, &i.SourceCheckItemID, &i.StationID,
		&i.IssueTypeID, &severity, &i.Description, &i.PictureURL, &status,
		&i.IssueReporterID, &i.IssueDate, &i.ProcessReporterID, &i.ProcessDate,
		&i.FinishReporterID, &i.FinishDate, &i.ApproveReporterID, &i.ApproveDate,
		&i.ConditionalApproveReporterID, &i.ConditionalApproveDate,
		&i.IssuePictureDoneURL, &i.SolutionDescription, &i.CreatedAt, &i.UpdatedAt,
		&i.ReporterName,
	); err != nil {
		return nil, err
	}
	i.SourceType = domain.IssueSource(source)
	i.Severity = domain.IssueSeverity(severity)
	i.Status = domain.IssueStatus(status)
	return &i, nil
}

// Create inserts a new issue and returns its generated ID.
func (r *IssueRepo) Create(ctx context.Context, issue *domain.Issue) (int64, error) {
	var id int64
	err := executor(ctx, r.pool).QueryRow(ctx,
		`INSERT INTO issue_list
		    (vin, source_type, source_station_step_id, source_check_item_id, station_id,
		     issue_type_id, severity, description, picture_url, status, issue_reporter_id)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULLIF($9, ''), $10, $11)
		 RETURNING id`,
		issue.VIN, string(issue.SourceType), issue.SourceStationStepID, issue.SourceCheckItemID,
		issue.StationID, issue.IssueTypeID, string(issue.Severity), issue.Description,
		issue.PictureURL, string(issue.Status), issue.IssueReporterID,
	).Scan(&id)
	return id, err
}

// GetByID returns the issue with the given ID.
func (r *IssueRepo) GetByID(ctx context.Context, id int64) (*domain.Issue, error) {
	row := executor(ctx, r.pool).QueryRow(ctx,
		`SELECT `+issueColumns+`
		 FROM issue_list i
		 LEFT JOIN users u ON u.id = i.issue_reporter_id
		 WHERE i.id = $1`, id)
	i, err := scanIssue(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, domain.ErrNotFound
	}
	return i, err
}

// ListForUser returns issues where the user is issue, process, or finish reporter.
func (r *IssueRepo) ListForUser(ctx context.Context, userID int, status *domain.IssueStatus) ([]domain.Issue, error) {
	var statusArg any
	if status != nil {
		statusArg = string(*status)
	}
	rows, err := r.pool.Query(ctx,
		`SELECT `+issueColumns+`
		 FROM issue_list i
		 LEFT JOIN users u ON u.id = i.issue_reporter_id
		 WHERE (i.issue_reporter_id = $1 OR i.process_reporter_id = $1 OR i.finish_reporter_id = $1)
		   AND ($2::issue_status_enum IS NULL OR i.status = $2::issue_status_enum)
		 ORDER BY i.updated_at DESC`, userID, statusArg)
	if err != nil {
		return nil, err
	}
	return collectIssues(rows)
}

// ListAll returns every issue, optionally filtered by status.
func (r *IssueRepo) ListAll(ctx context.Context, status *domain.IssueStatus) ([]domain.Issue, error) {
	var statusArg any
	if status != nil {
		statusArg = string(*status)
	}
	rows, err := r.pool.Query(ctx,
		`SELECT `+issueColumns+`
		 FROM issue_list i
		 LEFT JOIN users u ON u.id = i.issue_reporter_id
		 WHERE ($1::issue_status_enum IS NULL OR i.status = $1::issue_status_enum)
		 ORDER BY i.updated_at DESC`, statusArg)
	if err != nil {
		return nil, err
	}
	return collectIssues(rows)
}

// ListByVIN returns every issue for a vehicle, optionally filtered by status.
func (r *IssueRepo) ListByVIN(ctx context.Context, vin string, status *domain.IssueStatus) ([]domain.Issue, error) {
	var statusArg any
	if status != nil {
		statusArg = string(*status)
	}
	rows, err := r.pool.Query(ctx,
		`SELECT `+issueColumns+`
		 FROM issue_list i
		 LEFT JOIN users u ON u.id = i.issue_reporter_id
		 WHERE i.vin = $1
		   AND ($2::issue_status_enum IS NULL OR i.status = $2::issue_status_enum)
		 ORDER BY i.updated_at DESC`, vin, statusArg)
	if err != nil {
		return nil, err
	}
	return collectIssues(rows)
}

// ListOpenByVIN returns the vehicle's not-yet-closed issues. The status set
// matches fn_enforce_depot_release so the application-layer gate check and the
// database trigger agree on what "open" means.
func (r *IssueRepo) ListOpenByVIN(ctx context.Context, vin string) ([]domain.Issue, error) {
	rows, err := executor(ctx, r.pool).Query(ctx,
		`SELECT `+issueColumns+`
		 FROM issue_list i
		 LEFT JOIN users u ON u.id = i.issue_reporter_id
		 WHERE i.vin = $1 AND i.status IN ('OPEN', 'IN_PROGRESS', 'DONE')
		 ORDER BY i.severity, i.id`, vin)
	if err != nil {
		return nil, err
	}
	return collectIssues(rows)
}

func collectIssues(rows pgx.Rows) ([]domain.Issue, error) {
	defer rows.Close()

	var out []domain.Issue
	for rows.Next() {
		i, err := scanIssue(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *i)
	}
	return out, rows.Err()
}

// UpdateStatus transitions an issue and stamps the acting user against the
// appropriate lifecycle column. Every reachable target has an explicit case
// with a query whose placeholder count matches the arguments passed; any
// unsupported target returns an error immediately without building a query
// (this avoids the previous parameter-count mismatch bug).
func (r *IssueRepo) UpdateStatus(ctx context.Context, id int64, status domain.IssueStatus, actorID int, solutionDescription string) error {
	var query string
	var args []any
	switch status {
	case domain.IssueStatusInProgress:
		query = `UPDATE issue_list
		         SET status = $2, process_reporter_id = $3, process_date = now()
		         WHERE id = $1`
		args = []any{id, string(status), actorID}
	case domain.IssueStatusDone:
		query = `UPDATE issue_list
		         SET status = $2, finish_reporter_id = $3, finish_date = now(),
		             solution_description = $4
		         WHERE id = $1`
		args = []any{id, string(status), actorID, solutionDescription}
	case domain.IssueStatusApproved:
		query = `UPDATE issue_list
		         SET status = $2, approve_reporter_id = $3, approve_date = now()
		         WHERE id = $1`
		args = []any{id, string(status), actorID}
	case domain.IssueStatusConditionalApproved:
		query = `UPDATE issue_list
		         SET status = $2, conditional_approve_reporter_id = $3,
		             conditional_approve_date = now()
		         WHERE id = $1`
		args = []any{id, string(status), actorID}
	default:
		return domain.ErrInvalidStatusTransition
	}

	tag, err := executor(ctx, r.pool).Exec(ctx, query, args...)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrNotFound
	}
	return nil
}

// ListIssueTypes returns the issue_types catalogue ordered by id.
func (r *IssueRepo) ListIssueTypes(ctx context.Context) ([]domain.IssueType, error) {
	rows, err := r.pool.Query(ctx, `SELECT id, name FROM issue_types ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []domain.IssueType
	for rows.Next() {
		var t domain.IssueType
		if err := rows.Scan(&t.ID, &t.Name); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}
