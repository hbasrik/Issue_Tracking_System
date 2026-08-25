package domain

import "time"

// AnalysisFilter carries the dynamic Analysis-tab filters (FR-6.4/FR-6.7).
// All non-nil/non-empty fields are combined with AND semantics. From/To are
// inclusive calendar dates; the repository treats To as the whole day.
type AnalysisFilter struct {
	From          *time.Time
	To            *time.Time
	StationID     *int
	VehicleStatus *VehicleStatus
	Severity      *IssueSeverity
	VINSuffix     string
	IssueType     string
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

// StationDefectRate is one row of the date-filtered defect-rate query.
type StationDefectRate struct {
	StationID         int
	StationName       string
	VehiclesWithIssue int64
	IssueCount        int64
}

// StationMTTR is mean time to resolve per station (IN_PROGRESS → DONE).
type StationMTTR struct {
	StationID         int
	StationName       string
	MeanTimeToResolve time.Duration
	Hours             float64
}

// VehicleSeverityBreakdown is per-vehicle open-issue counts split by severity.
type VehicleSeverityBreakdown struct {
	VIN             string
	TotalOpenIssues int64
	CriticalCount   int64
	MediumCount     int64
	LowCount        int64
}

// IssueStatusCount is one slice of the issue-status pie.
type IssueStatusCount struct {
	Status IssueStatus
	Count  int64
}

// IssueTypeCount is one row of the top-issue-types bar.
type IssueTypeCount struct {
	Name  string
	Count int64
}

// EOLStageCount is one slice of the live EOL funnel.
type EOLStageCount struct {
	Stage string
	Count int64
}

// WorkSplit is "Biten / Devam Eden İşler": issues whose repair is finished
// (DONE / APPROVED / CONDITIONAL_APPROVED) vs still in flight (OPEN / IN_PROGRESS).
type WorkSplit struct {
	Completed int64
	Ongoing   int64
}

// AnalysisKPIs is the Analysis-tab headline numbers. Today/week windows are
// calendar days in Europe/Istanbul intersected with From/To when set.
type AnalysisKPIs struct {
	ShippedToday          int64
	ShippedWeek           int64
	ShippedInRange        int64
	DepotReleasedInRange  int64
	AvgResolutionHours    *float64
	FirstTimeRightPercent *float64
	OpenIssuesInRange     int64
}

// AnalysisDashboard is the Analysis page payload: every series honors the
// same filter.
type AnalysisDashboard struct {
	KPIs           AnalysisKPIs
	WorkSplit      WorkSplit
	IssueStatus    []IssueStatusCount
	DefectRate     []StationDefectRate
	MTTR           []StationMTTR
	Severity       []VehicleSeverityBreakdown
	EOLFunnel      []EOLStageCount
	TopIssueTypes  []IssueTypeCount
	CompletedDaily []CompletedIssuesDaily
}
