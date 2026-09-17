package domain

import "time"

// VehicleStatus mirrors the vehicle_status_enum type in the database.
type VehicleStatus string

const (
	VehicleStatusPlanned      VehicleStatus = "PLANNED"
	VehicleStatusInProduction VehicleStatus = "IN_PRODUCTION"
	VehicleStatusInWarehouse  VehicleStatus = "IN_WAREHOUSE"
	VehicleStatusDelivered VehicleStatus = "DELIVERED"
	VehicleStatusShipped      VehicleStatus = "SHIPPED"
	VehicleStatusOnHold       VehicleStatus = "ON_HOLD"
)

// Valid reports whether the status is one of the known enum values.
func (s VehicleStatus) Valid() bool {
	switch s {
	case VehicleStatusPlanned, VehicleStatusInProduction, VehicleStatusInWarehouse,
		VehicleStatusDelivered, VehicleStatusShipped, VehicleStatusOnHold:
		return true
	default:
		return false
	}
}

// IssueReportVehicleStatuses is the single list of statuses a VIN may have
// when an operator opens a defect report (manual or station-step). Create
// Issue looks the VIN up and does not reject on status, so the offline
// cache and live typeahead must include every one of these — including
// PLANNED (Karar 10: the Vehicles table hides them, issue entry must not).
func IssueReportVehicleStatuses() []VehicleStatus {
	return []VehicleStatus{
		VehicleStatusPlanned,
		VehicleStatusInProduction,
		VehicleStatusInWarehouse,
		VehicleStatusDelivered,
		VehicleStatusShipped,
		VehicleStatusOnHold,
	}
}

// VehicleEligibleForIssueReport is true when a VIN in this status can be
// chosen on the issue-report form.
func VehicleEligibleForIssueReport(status VehicleStatus) bool {
	for _, s := range IssueReportVehicleStatuses() {
		if status == s {
			return true
		}
	}
	return false
}

// IssueReportStatusSQL is the WHERE fragment matching IssueReportVehicleStatuses.
func IssueReportStatusSQL(column string) string {
	return column + " IN ('PLANNED','IN_PRODUCTION','IN_WAREHOUSE','DELIVERED','SHIPPED','ON_HOLD')"
}

// VehicleAnalysisStat is a dashboard-card drill-down key for GET /vehicles.
type VehicleAnalysisStat string

const (
	VehicleAnalysisStatOnLine        VehicleAnalysisStat = "on_line"
	VehicleAnalysisStatShippedToday  VehicleAnalysisStat = "shipped_today"
	VehicleAnalysisStatShippedWeek   VehicleAnalysisStat = "shipped_week"
	VehicleAnalysisStatDepotReleased VehicleAnalysisStat = "depot_released"
)

// Valid reports whether the drill-down key is known (empty is valid: no drill-down).
func (s VehicleAnalysisStat) Valid() bool {
	switch s {
	case "", VehicleAnalysisStatOnLine, VehicleAnalysisStatShippedToday,
		VehicleAnalysisStatShippedWeek, VehicleAnalysisStatDepotReleased:
		return true
	default:
		return false
	}
}

// VehicleListFilter carries the filters for the web vehicle-list table
// (VIN fragment, lifecycle, model) plus pagination. Non-empty/non-nil fields are
// combined with AND semantics. List/Count always hide PLANNED vehicles
// (Karar 10) unless Lifecycle is explicitly PLANNED. AnalysisStat, when set, is
// the Analysis KPI card drill-down (shipped in window, depot-released in
// window, or live IN_PRODUCTION snapshot).
type VehicleListFilter struct {
	VINContains  string
	Status       *VehicleStatus // legacy; prefer Lifecycle
	Lifecycle    *VehicleLifecycle
	EOLStage     *EOLWorkflowStage // legacy; prefer Lifecycle
	ModelID      *int
	StationID    *int
	AnalysisStat VehicleAnalysisStat
	WindowFrom   *time.Time
	WindowUntil  *time.Time
	// ForIssueReport uses IssueReportVehicleStatuses (includes PLANNED)
	// instead of the Vehicles-table Karar 10 exclusion.
	ForIssueReport bool
	Limit          int
	Offset         int
}

// Vehicle mirrors the vehicles table (master vehicle identity). Karar 1
// replaces the current_phase number with a foreign key to the station the
// vehicle currently sits at; it is nullable because a vehicle has no station
// until its first step progress row is evaluated. VehicleModelID is nullable
// for PLANNED bulk imports (Karar 10).
type Vehicle struct {
	VIN                     string
	VehicleModelID          *int
	CurrentGlobalStatus     VehicleStatus
	CurrentEOLStage         *EOLWorkflowStage
	StatusBeforeHold        *VehicleStatus
	HoldReason              *string
	CurrentStationID        *int
	TotalProgressPercentage float64
	EOLTemplateID           *int
	ShipmentTemplateID      *int
	TestTemplateID          *int
	CreatedAt               time.Time
	UpdatedAt               time.Time
}
