package domain

import "time"

// VehicleStatus mirrors the vehicle_status_enum type in the database.
type VehicleStatus string

const (
	VehicleStatusInProduction VehicleStatus = "IN_PRODUCTION"
	VehicleStatusInWarehouse  VehicleStatus = "IN_WAREHOUSE"
	VehicleStatusWithCustomer VehicleStatus = "WITH_CUSTOMER"
	VehicleStatusShipped      VehicleStatus = "SHIPPED"
	VehicleStatusOnHold       VehicleStatus = "ON_HOLD"
)

// Valid reports whether the status is one of the known enum values.
func (s VehicleStatus) Valid() bool {
	switch s {
	case VehicleStatusInProduction, VehicleStatusInWarehouse,
		VehicleStatusWithCustomer, VehicleStatusShipped, VehicleStatusOnHold:
		return true
	default:
		return false
	}
}

// VehicleListFilter carries the filters for the web vehicle-list table
// (VIN fragment, status, model) plus pagination. Non-empty/non-nil fields are
// combined with AND semantics.
type VehicleListFilter struct {
	VINContains string
	Status      *VehicleStatus
	ModelID     *int
	StationID   *int
	Limit       int
	Offset      int
}

// Vehicle mirrors the vehicles table (master vehicle identity). Karar 1
// replaces the current_phase number with a foreign key to the station the
// vehicle currently sits at; it is nullable because a vehicle has no station
// until its first step progress row is evaluated.
type Vehicle struct {
	VIN                     string
	VehicleNumber           string
	VehicleModelID          int
	CurrentGlobalStatus     VehicleStatus
	CurrentStationID        *int
	TotalProgressPercentage float64
	EOLTemplateID           *int
	ShipmentTemplateID      *int
	TestTemplateID          *int
	CreatedAt               time.Time
	UpdatedAt               time.Time
}
