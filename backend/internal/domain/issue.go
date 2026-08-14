package domain

import "time"

// IssueStatus mirrors the issue_status_enum type.
type IssueStatus string

const (
	IssueStatusOpen       IssueStatus = "OPEN"        // Bekliyor
	IssueStatusInProgress IssueStatus = "IN_PROGRESS" // Islemde
	IssueStatusDone       IssueStatus = "DONE"        // Tamamlandi: repair finished, awaiting sign-off
	IssueStatusApproved   IssueStatus = "APPROVED"    // Kalite Onay: terminal closed state
)

// Valid reports whether the issue status is a known enum value.
func (s IssueStatus) Valid() bool {
	switch s {
	case IssueStatusOpen, IssueStatusInProgress, IssueStatusDone, IssueStatusApproved:
		return true
	default:
		return false
	}
}

// IssueSeverity mirrors the issue_severity_enum type (Decision Log #7).
type IssueSeverity string

const (
	IssueSeverityCritical IssueSeverity = "CRITICAL"
	IssueSeverityMedium   IssueSeverity = "MEDIUM"
	IssueSeverityLow      IssueSeverity = "LOW"
)

// Valid reports whether the severity is a known enum value.
func (s IssueSeverity) Valid() bool {
	switch s {
	case IssueSeverityCritical, IssueSeverityMedium, IssueSeverityLow:
		return true
	default:
		return false
	}
}

// IssueSource mirrors the issue_source_enum type.
type IssueSource string

const (
	IssueSourceStationStep  IssueSource = "STATION_STEP"
	IssueSourceEOLItem      IssueSource = "EOL_ITEM"
	IssueSourceShipmentItem IssueSource = "SHIPMENT_ITEM"
	IssueSourceTestItem     IssueSource = "TEST_ITEM"
)

// Valid reports whether the issue source is a known enum value.
func (s IssueSource) Valid() bool {
	switch s {
	case IssueSourceStationStep, IssueSourceEOLItem, IssueSourceShipmentItem, IssueSourceTestItem:
		return true
	default:
		return false
	}
}

// IsOpen reports whether the issue still counts against the EOL depot-release
// hard-block gate. It mirrors the OPEN/IN_PROGRESS/DONE predicate used by
// fn_enforce_depot_release and idx_issue_list_open_by_vin: only APPROVED is
// considered closed, because DONE still awaits quality sign-off.
func (s IssueStatus) IsOpen() bool {
	switch s {
	case IssueStatusOpen, IssueStatusInProgress, IssueStatusDone:
		return true
	default:
		return false
	}
}

// Issue mirrors the issue_list table (issue & repair lifecycle).
type Issue struct {
	ID                  int64
	VIN                 string
	SourceType          IssueSource
	SourceStationStepID *int
	SourceCheckItemID   *int
	StationID           *int
	IssueTypeID         *int
	Severity            IssueSeverity
	Description         string
	PictureURL          string
	Status              IssueStatus
	IssueReporterID     int
	IssueDate           time.Time
	ProcessReporterID   *int
	ProcessDate         *time.Time
	FinishReporterID    *int
	FinishDate          *time.Time
	ApproveReporterID   *int
	ApproveDate         *time.Time
	IssuePictureDoneURL string
	SolutionDescription string
	CreatedAt           time.Time
	UpdatedAt           time.Time
}
