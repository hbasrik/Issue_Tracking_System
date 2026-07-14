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

// Create inserts a new issue and returns its generated ID.
func (r *IssueRepo) Create(ctx context.Context, issue *domain.Issue) (int64, error) {
	var id int64
	err := r.pool.QueryRow(ctx,
		`INSERT INTO issue_list
		    (vin, source_type, source_checkpoint_id, source_check_item_id, station_id,
		     issue_type_id, severity, description, picture_url, status, issue_reporter_id)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULLIF($9, ''), $10, $11)
		 RETURNING id`,
		issue.VIN, string(issue.SourceType), issue.SourceCheckpointID, issue.SourceCheckItemID,
		issue.StationID, issue.IssueTypeID, string(issue.Severity), issue.Description,
		issue.PictureURL, string(issue.Status), issue.IssueReporterID,
	).Scan(&id)
	return id, err
}

// GetByID returns the issue with the given ID.
func (r *IssueRepo) GetByID(ctx context.Context, id int64) (*domain.Issue, error) {
	var i domain.Issue
	var source, severity, status string
	err := r.pool.QueryRow(ctx,
		`SELECT id, vin, source_type, source_checkpoint_id, source_check_item_id, station_id,
		        issue_type_id, severity, description, COALESCE(picture_url, ''), status,
		        issue_reporter_id, issue_date, process_reporter_id, process_date,
		        finish_reporter_id, finish_date, approve_reporter_id, approve_date,
		        COALESCE(issue_picture_done_url, ''), COALESCE(solution_description, ''),
		        created_at, updated_at
		 FROM issue_list WHERE id = $1`, id).Scan(
		&i.ID, &i.VIN, &source, &i.SourceCheckpointID, &i.SourceCheckItemID, &i.StationID,
		&i.IssueTypeID, &severity, &i.Description, &i.PictureURL, &status,
		&i.IssueReporterID, &i.IssueDate, &i.ProcessReporterID, &i.ProcessDate,
		&i.FinishReporterID, &i.FinishDate, &i.ApproveReporterID, &i.ApproveDate,
		&i.IssuePictureDoneURL, &i.SolutionDescription, &i.CreatedAt, &i.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, domain.ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	i.SourceType = domain.IssueSource(source)
	i.Severity = domain.IssueSeverity(severity)
	i.Status = domain.IssueStatus(status)
	return &i, nil
}

// UpdateStatus transitions an issue and stamps the acting user against the
// appropriate lifecycle column (process on IN_PROGRESS, finish on DONE).
func (r *IssueRepo) UpdateStatus(ctx context.Context, id int64, status domain.IssueStatus, actorID int) error {
	var query string
	switch status {
	case domain.IssueStatusInProgress:
		query = `UPDATE issue_list
		         SET status = $2, process_reporter_id = $3, process_date = now()
		         WHERE id = $1`
	case domain.IssueStatusDone:
		query = `UPDATE issue_list
		         SET status = $2, finish_reporter_id = $3, finish_date = now()
		         WHERE id = $1`
	default:
		query = `UPDATE issue_list SET status = $2 WHERE id = $1`
	}

	tag, err := r.pool.Exec(ctx, query, id, string(status), actorID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrNotFound
	}
	return nil
}
