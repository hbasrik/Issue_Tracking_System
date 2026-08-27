package domain

import "time"

// Station mirrors the stations table. Karar 1 replaces v1's fixed 8 phases
// with an ordered, extensible station catalogue: eight rows are seeded, but
// the table imposes no limit and sequence_no carries the ordering that
// phase_number used to.
type Station struct {
	ID         int
	Name       string
	SequenceNo int16
	IsActive   bool
}

// StationStep mirrors the station_steps catalogue table — the per-station
// checks that v1 called checkpoints.
type StationStep struct {
	ID         int
	StationID  int
	SequenceNo int16
	Name       string
	IsActive   bool
}

// StationStepStatus mirrors the station_step_status_enum type.
type StationStepStatus string

const (
	StationStepStatusPending StationStepStatus = "PENDING"
	StationStepStatusOK      StationStepStatus = "OK"
	StationStepStatusNotOK   StationStepStatus = "NOT_OK"
)

// Valid reports whether the station step status is a known enum value.
func (s StationStepStatus) Valid() bool {
	switch s {
	case StationStepStatusPending, StationStepStatusOK, StationStepStatusNotOK:
		return true
	default:
		return false
	}
}

// VehicleStationStepProgress mirrors the vehicle_station_step_progress table:
// a vehicle-scoped tick against a single station step.
type VehicleStationStepProgress struct {
	ID             int64
	VIN            string
	StationID      int
	StationStepID  int
	Status         StationStepStatus
	CheckedBy      *int
	CheckedAt      *time.Time
	RelatedIssueID *int64
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

// StationStepItemView is the operator-facing join of the station step
// catalogue with per-vehicle progress. CheckedByName/CheckedAt are the
// last operator who ticked the step (empty while Status is PENDING).
type StationStepItemView struct {
	ID             int
	StationID      int
	StationName    string
	SequenceNo     int16
	Name           string
	Status         StationStepStatus
	RelatedIssueID *int64
	CheckedByName  string     `json:"CheckedByName,omitempty"`
	CheckedAt      *time.Time `json:"CheckedAt,omitempty"`
}

// VehicleStationStepsResult is returned by the per-vehicle station step read.
// OpenIssuesByStation is keyed by station id rendered as a string so it
// serializes as a JSON object.
type VehicleStationStepsResult struct {
	Items               []StationStepItemView
	OpenIssuesByStation map[string]int
}
