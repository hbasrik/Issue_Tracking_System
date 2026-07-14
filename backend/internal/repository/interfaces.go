// Package repository defines persistence interfaces consumed by the usecase
// layer. Concrete implementations live in sub-packages (e.g. postgres).
package repository

import (
	"context"

	"github.com/karea/backend/internal/domain"
)

// VehicleRepository persists and queries vehicles.
type VehicleRepository interface {
	// GetByVIN returns the vehicle with the exact VIN, or domain.ErrNotFound.
	GetByVIN(ctx context.Context, vin string) (*domain.Vehicle, error)
	// SearchByVINSuffix returns vehicles whose VIN contains the given suffix
	// (partial trigram search), capped at limit rows.
	SearchByVINSuffix(ctx context.Context, suffix string, limit int) ([]domain.Vehicle, error)
	// UpdateProgress persists the recomputed completion percentage and current
	// phase for a vehicle.
	UpdateProgress(ctx context.Context, vin string, percentage float64, currentPhase int16) error
	// UpdateStatus persists a new global status for a vehicle.
	UpdateStatus(ctx context.Context, vin string, status domain.VehicleStatus) error
}

// CheckpointProgressRepository persists and queries per-vehicle checkpoint
// progress (production_phase_progress).
type CheckpointProgressRepository interface {
	// ListByVIN returns all checkpoint progress rows for a vehicle.
	ListByVIN(ctx context.Context, vin string) ([]domain.PhaseCheckpointProgress, error)
	// SaveResult updates the status (and checker/timestamp) of a single
	// pre-materialized checkpoint progress row.
	SaveResult(ctx context.Context, vin string, checkpointID int, status domain.CheckpointStatus, checkedBy int) error
}

// ChecklistProgressRepository persists and queries per-vehicle checklist
// progress (eol_and_shipment_checklist_progress).
type ChecklistProgressRepository interface {
	// ListByVINAndType returns all checklist progress rows of a given type for
	// a vehicle.
	ListByVINAndType(ctx context.Context, vin string, checklistType domain.ChecklistType) ([]domain.ChecklistProgress, error)
	// SaveResult updates a single pre-materialized checklist progress row.
	SaveResult(ctx context.Context, result domain.ChecklistProgress) error
}

// IssueRepository persists and queries issues.
type IssueRepository interface {
	// Create inserts a new issue and returns its generated ID.
	Create(ctx context.Context, issue *domain.Issue) (int64, error)
	// GetByID returns the issue with the given ID, or domain.ErrNotFound.
	GetByID(ctx context.Context, id int64) (*domain.Issue, error)
	// UpdateStatus transitions an issue to a new status, recording the acting
	// user against the appropriate lifecycle timestamp column.
	UpdateStatus(ctx context.Context, id int64, status domain.IssueStatus, actorID int) error
}

// AnalysisRepository reads the Analysis-tab SQL views.
type AnalysisRepository interface {
	DailyPendingIssues(ctx context.Context, f domain.AnalysisFilter) ([]domain.DailyPendingIssue, error)
	CompletedIssuesDaily(ctx context.Context, f domain.AnalysisFilter) ([]domain.CompletedIssuesDaily, error)
	DefectRatePerStation(ctx context.Context, f domain.AnalysisFilter) ([]domain.StationDefectRate, error)
	MTTRPerStation(ctx context.Context, f domain.AnalysisFilter) ([]domain.StationMTTR, error)
	VehicleSeverityBreakdown(ctx context.Context, f domain.AnalysisFilter) ([]domain.VehicleSeverityBreakdown, error)
}

// UserRepository persists and queries users (used by auth).
type UserRepository interface {
	GetByEmail(ctx context.Context, email string) (*domain.User, error)
	GetByID(ctx context.Context, id int) (*domain.User, error)
}

// AuditRepository appends rows to the append-only audit log.
type AuditRepository interface {
	Append(ctx context.Context, entry domain.AuditLog) error
}
