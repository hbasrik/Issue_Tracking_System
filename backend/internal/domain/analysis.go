package domain

import "time"

// AnalysisFilter carries the dynamic Analysis-tab filters (FR-6.4/FR-6.7).
// All non-nil fields are combined with AND semantics.
type AnalysisFilter struct {
	From          *time.Time
	To            *time.Time
	PhaseNumber   *int16
	VehicleStatus *VehicleStatus
	Severity      *IssueSeverity
	VINSuffix     string
}

// DailyPendingIssue is one row of vw_daily_pending_issues.
type DailyPendingIssue struct {
	Day          time.Time
	PendingCount int64
}

// CompletedIssuesDaily is one row of vw_completed_issues_daily.
type CompletedIssuesDaily struct {
	Day            time.Time
	CompletedCount int64
}

// StationDefectRate is one row of vw_defect_rate_per_station.
type StationDefectRate struct {
	StationID         int
	StationName       string
	VehiclesWithIssue int64
	IssueCount        int64
}

// StationMTTR is one row of vw_issue_mttr (mean time to resolve).
type StationMTTR struct {
	StationID         int
	MeanTimeToResolve time.Duration
}

// VehicleSeverityBreakdown is one row of
// vw_vehicle_open_issue_severity_breakdown (Decision Log #7).
type VehicleSeverityBreakdown struct {
	VIN             string
	TotalOpenIssues int64
	CriticalCount   int64
	MediumCount     int64
	LowCount        int64
}
