package domain

import "time"

// IssueStatus mirrors the issue_status_enum type.
type IssueStatus string

const (
	IssueStatusOpen       IssueStatus = "OPEN"        // Bekliyor
	IssueStatusInProgress IssueStatus = "IN_PROGRESS" // Islemde
	IssueStatusDone       IssueStatus = "DONE"        // Tamamlandi: repair finished, awaiting sign-off
	IssueStatusApproved   IssueStatus = "APPROVED"    // Kalite Onay: terminal closed state
	// IssueStatusConditionalApproved is Karar 6's second terminal state: the
	// quality decision closed the issue with a reservation rather than a full
	// approval. It is a sibling of APPROVED, not a step before it.
	IssueStatusConditionalApproved IssueStatus = "CONDITIONAL_APPROVED" // Sartli Onay
)

// Valid reports whether the issue status is a known enum value.
func (s IssueStatus) Valid() bool {
	switch s {
	case IssueStatusOpen, IssueStatusInProgress, IssueStatusDone,
		IssueStatusApproved, IssueStatusConditionalApproved:
		return true
	default:
		return false
	}
}

// IsTerminal reports whether the issue has received a quality decision and can
// no longer be transitioned. Karar 6 gives the lifecycle two terminal states.
func (s IssueStatus) IsTerminal() bool {
	return s == IssueStatusApproved || s == IssueStatusConditionalApproved
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
	// IssueSourceManual is a standalone operator report (Hata Bildir) with no
	// linked station step or checklist item.
	IssueSourceManual IssueSource = "MANUAL"
)

// Valid reports whether the issue source is a known enum value.
func (s IssueSource) Valid() bool {
	switch s {
	case IssueSourceStationStep, IssueSourceEOLItem, IssueSourceShipmentItem,
		IssueSourceTestItem, IssueSourceManual:
		return true
	default:
		return false
	}
}

// IsOpen reports whether the issue still counts against the EOL depot-release
// hard-block gate. It mirrors the OPEN/IN_PROGRESS/DONE predicate used by
// fn_enforce_depot_release and idx_issue_list_open_by_vin: an issue is closed
// only once it reaches a terminal state, because DONE still awaits quality
// sign-off.
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
	// ConditionalApprove* mirror the Karar 6 columns, written instead of the
	// Approve* pair when the quality decision was a conditional sign-off.
	ConditionalApproveReporterID *int
	ConditionalApproveDate       *time.Time
	IssuePictureDoneURL          string
	SolutionDescription          string
	CreatedAt                    time.Time
	UpdatedAt                    time.Time
	// ReporterName is populated on list queries via join to users; not a
	// persisted column on issue_list.
	ReporterName string
	// ReportPhotoPath is the storage_path of the earliest ISSUE media
	// attachment (report photo), when present. Not a column on issue_list —
	// filled by list/get queries via media_attachments.
	ReportPhotoPath string
	// IssueTypeName / StationName / *ReporterName are list/get joins, not
	// columns on issue_list. Used by the Issues export.
	IssueTypeName                    string
	StationName                      string
	ProcessReporterName              string
	FinishReporterName               string
	ApproveReporterName              string
	ConditionalApproveReporterName   string
}

// IssueType is a row from the issue_types catalogue (Hata / Tamir Gerekiyor).
type IssueType struct {
	ID   int
	Name string
}
