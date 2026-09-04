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
	EOLStage      string // BRANCH | DEPOT | COMPLETED (DOCUMENT maps to DEPOT)
	VINSuffix     string
	IssueType     string
	CompareMode   string // previous_period | previous_week | previous_month
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
// OnLineCount is a snapshot (IN_PRODUCTION) and ignores the date window.
type AnalysisKPIs struct {
	ShippedToday          int64
	ShippedWeek           int64
	ShippedInRange        int64
	DepotReleasedInRange  int64
	AvgResolutionHours    *float64
	FirstTimeRightPercent *float64
	OpenIssuesInRange     int64
	OnLineCount           int64
}

const istanbulTZ = "Europe/Istanbul"

// StartOfUTCDay truncates t to midnight UTC (calendar-day bound for filters).
func StartOfUTCDay(t time.Time) time.Time {
	y, m, d := t.UTC().Date()
	return time.Date(y, m, d, 0, 0, 0, 0, time.UTC)
}

// IstanbulDayStart is local midnight in Europe/Istanbul for now.
func IstanbulDayStart(now time.Time) time.Time {
	loc, err := time.LoadLocation(istanbulTZ)
	if err != nil {
		loc = time.UTC
	}
	n := now.In(loc)
	return time.Date(n.Year(), n.Month(), n.Day(), 0, 0, 0, 0, loc)
}

// IntersectWindow clips an Istanbul (or other) [winFrom, winUntil) half-open
// range with optional inclusive calendar From/To. empty is true when the
// intersection has no duration.
func IntersectWindow(from, to *time.Time, winFrom, winUntil time.Time) (clippedFrom, clippedUntil time.Time, empty bool) {
	clippedFrom, clippedUntil = winFrom, winUntil
	if from != nil {
		if StartOfUTCDay(*from).After(clippedFrom) {
			clippedFrom = StartOfUTCDay(*from)
		}
	}
	if to != nil {
		end := StartOfUTCDay(*to).Add(24 * time.Hour)
		if end.Before(clippedUntil) {
			clippedUntil = end
		}
	}
	if !clippedFrom.Before(clippedUntil) {
		return clippedFrom, clippedUntil, true
	}
	return clippedFrom, clippedUntil, false
}

// InclusiveDateBounds maps optional inclusive calendar dates to [from, until)
// timestamps. Nil inputs stay nil.
func InclusiveDateBounds(from, to *time.Time) (fromTS, untilTS *time.Time) {
	if from != nil {
		t := StartOfUTCDay(*from)
		fromTS = &t
	}
	if to != nil {
		t := StartOfUTCDay(*to).Add(24 * time.Hour)
		untilTS = &t
	}
	return fromTS, untilTS
}

// HomeEOLStageCount is non-PLANNED vehicles in one live EOL workflow stage.
type HomeEOLStageCount struct {
	Stage string
	Count int64
}

// HomeEOLChecklistCount is passing vs total EOL checklist rows for one phase.
// VehicleCount is distinct VINs contributing rows; ItemsPerVehicle is the
// distinct template-item count (so Total ≈ VehicleCount × ItemsPerVehicle).
type HomeEOLChecklistCount struct {
	Phase            string
	Done             int64
	Total            int64
	VehicleCount     int64
	ItemsPerVehicle  int64
}

// HomeCriticalVehicle is a VIN ranked by open CRITICAL issue count.
type HomeCriticalVehicle struct {
	VIN            string
	CriticalCount  int64
	WorstSeverity  string
	Status         string
	EOLStage       string
}

// HomeActivityEntry is one recent audit_logs row with the acting user and
// optional checklist item context for readable detail lines.
type HomeActivityEntry struct {
	EventAt         time.Time
	EventType       string
	VIN             string
	OldValue        string
	NewValue        string
	ActorName       string
	ActorEmail      string
	ChecklistType   string
	ItemNo          *int
	ItemText        string
}

// AuditActivityFilter scopes the paginated plant-wide activity list.
type AuditActivityFilter struct {
	From       *time.Time
	To         *time.Time
	EventType  string
	ActorID    *int
	ActorQuery string // matches actor full_name or email (case-insensitive)
	VINSuffix  string
	Limit      int
	Offset     int
}

// AuditActivityPage is one page of audit activity rows.
type AuditActivityPage struct {
	Items []HomeActivityEntry
	Total int64
}

// HomeOverview is the dashboard payload that cannot be derived from the
// issue list alone (EOL funnel, checklist completion, activity feed).
type HomeOverview struct {
	EOLStages         []HomeEOLStageCount
	EOLChecklist      []HomeEOLChecklistCount
	CriticalVehicles  []HomeCriticalVehicle
	Activity          []HomeActivityEntry
}

// AnalysisDashboard is the Analysis page payload. Date-series honor the
// shared filter; snapshot KPIs (OnLineCount) ignore From/To.
type AnalysisDashboard struct {
	KPIs              AnalysisKPIs
	Cards             AnalysisKPICards
	CompareCards      AnalysisKPICards
	CompareMode       string
	WorkSplit         WorkSplit
	IssueStatus       []IssueStatusCount
	SeverityMix       []SeverityCount
	DefectRate        []StationDefectRate
	OpenByStation     []StationDefectRate // top open issues by station
	TotalByStation    []StationDefectRate // all issues by station (open+closed)
	MTTR              []StationMTTR
	Severity          []VehicleSeverityBreakdown
	EOLFunnel         []EOLStageCount
	StagePerformance  []StagePerformance
	TopIssueTypes     []IssueTypeCount
	CompletedDaily    []CompletedIssuesDaily
	DailyOpenTrend    []DailyPendingIssue
	OpenAgeBuckets    []OpenAgeBucket
	ConditionalMix    ConditionalApprovalMix
	Sparklines        AnalysisSparklines
}

// AnalysisKPICards is the redesigned Analysis headline strip (real counts only).
type AnalysisKPICards struct {
	TotalProduction       int64
	OpenIssues            int64
	CriticalOpen          int64
	PendingQuality        int64
	CompletionPercent     *float64
	BranchShipped         int64
	Delivered             int64
	OpenedIssues          int64
	ClosedIssues          int64
	AvgResolutionHours    *float64
	FirstTimeRightPercent *float64
}

// SeverityCount is one slice of the issue-severity donut.
type SeverityCount struct {
	Severity IssueSeverity
	Count    int64
}

// StagePerformance is completed/total for one EOL stage (no Evrak/DOCUMENT).
type StagePerformance struct {
	Stage     string
	Completed int64
	Total     int64
}

// OpenAgeBucket is how long currently-open issues have been open.
type OpenAgeBucket struct {
	Bucket string // "0-1" | "1-3" | "3-7" | "7+"
	Count  int64
}

// ConditionalApprovalMix is quality vs conditional closes in the window.
type ConditionalApprovalMix struct {
	Approved    int64
	Conditional int64
}

// AnalysisSparklines holds short daily series for KPI mini-charts.
type AnalysisSparklines struct {
	Production []DailyPendingIssue // reuse Day + count fields
	Opened     []CompletedIssuesDaily
	Closed     []CompletedIssuesDaily
	OpenStock  []DailyPendingIssue
}
