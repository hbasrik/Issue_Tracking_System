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

// Vehicle mirrors the vehicles table (master vehicle identity).
type Vehicle struct {
	VIN                     string
	VehicleModelID          int
	CurrentGlobalStatus     VehicleStatus
	CurrentPhase            int16
	TotalProgressPercentage float64
	EOLTemplateID           *int
	ShipmentTemplateID      *int
	CreatedAt               time.Time
	UpdatedAt               time.Time
}
