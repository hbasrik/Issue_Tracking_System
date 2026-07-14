package domain

import "time"

// CheckpointStatus mirrors the checkpoint_status_enum type.
type CheckpointStatus string

const (
	CheckpointStatusPending CheckpointStatus = "PENDING"
	CheckpointStatusOK      CheckpointStatus = "OK"
	CheckpointStatusNotOK   CheckpointStatus = "NOT_OK"
)

// Valid reports whether the checkpoint status is a known enum value.
func (s CheckpointStatus) Valid() bool {
	switch s {
	case CheckpointStatusPending, CheckpointStatusOK, CheckpointStatusNotOK:
		return true
	default:
		return false
	}
}

// Checkpoint mirrors the checkpoints catalogue table.
type Checkpoint struct {
	ID          int
	PhaseNumber int16
	StationID   *int
	SequenceNo  int16
	Name        string
	IsActive    bool
}

// PhaseCheckpointProgress mirrors the production_phase_progress table: a
// vehicle-scoped tick against a single checkpoint.
type PhaseCheckpointProgress struct {
	ID             int64
	VIN            string
	PhaseNumber    int16
	CheckpointID   int
	Status         CheckpointStatus
	CheckedBy      *int
	CheckedAt      *time.Time
	RelatedIssueID *int64
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

// CheckpointItemView is the operator-facing join of catalogue checkpoints with
// per-vehicle progress.
type CheckpointItemView struct {
	ID             int
	PhaseNumber    int16
	SequenceNo     int16
	Name           string
	StationID      *int
	Status         CheckpointStatus
	RelatedIssueID *int64
}

// VehicleCheckpointsResult is returned by GET /vehicles/{vin}/checkpoints.
type VehicleCheckpointsResult struct {
	Items             []CheckpointItemView
	OpenIssuesByPhase map[string]int
}
