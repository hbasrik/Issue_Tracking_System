package domain

import "time"

// VehicleStatus mirrors the vehicle_status_enum type in the database.
type VehicleStatus string

const (
	VehicleStatusPlanned      VehicleStatus = "PLANNED"
	VehicleStatusInProduction VehicleStatus = "IN_PRODUCTION"
	VehicleStatusInWarehouse  VehicleStatus = "IN_WAREHOUSE"
	VehicleStatusWithCustomer VehicleStatus = "WITH_CUSTOMER"
	VehicleStatusShipped      VehicleStatus = "SHIPPED"
	VehicleStatusOnHold       VehicleStatus = "ON_HOLD"
)

// Valid reports whether the status is one of the known enum values.
func (s VehicleStatus) Valid() bool {
	switch s {
	case VehicleStatusPlanned, VehicleStatusInProduction, VehicleStatusInWarehouse,
		VehicleStatusWithCustomer, VehicleStatusShipped, VehicleStatusOnHold:
		return true
	default:
		return false
	}
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
// (VIN fragment, status, model) plus pagination. Non-empty/non-nil fields are
// combined with AND semantics. List/Count always hide PLANNED vehicles
// (Karar 10); VIN typeahead is a separate query and includes them.
// AnalysisStat, when set, is the Analysis KPI card drill-down (shipped in
// window, depot-released in window, or live IN_PRODUCTION snapshot).
type VehicleListFilter struct {
	VINContains  string
	Status       *VehicleStatus
	ModelID      *int
	StationID    *int
	AnalysisStat VehicleAnalysisStat
	WindowFrom   *time.Time
	WindowUntil  *time.Time
	Limit        int
	Offset       int
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
	CurrentStationID        *int
	TotalProgressPercentage float64
	EOLTemplateID           *int
	ShipmentTemplateID      *int
	TestTemplateID          *int
	CreatedAt               time.Time
	UpdatedAt               time.Time
}
