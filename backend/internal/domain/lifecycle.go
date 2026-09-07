package domain

// VehicleLifecycle is the unified shop-floor life-cycle shown in filters and
// badges. READY_TO_SHIP is derived (IN_WAREHOUSE + COMPLETED stage) — not a
// vehicles.current_global_status enum value.
type VehicleLifecycle string

const (
	LifecyclePlanned     VehicleLifecycle = "PLANNED"
	LifecycleOnLine      VehicleLifecycle = "ON_LINE"
	LifecycleAtDepot     VehicleLifecycle = "AT_DEPOT"
	LifecycleReadyToShip VehicleLifecycle = "READY_TO_SHIP"
	LifecycleDelivered   VehicleLifecycle = "DELIVERED"
	LifecycleOnHold      VehicleLifecycle = "ON_HOLD"
)

// Valid reports whether the lifecycle filter key is known.
func (l VehicleLifecycle) Valid() bool {
	switch l {
	case LifecyclePlanned, LifecycleOnLine, LifecycleAtDepot,
		LifecycleReadyToShip, LifecycleDelivered, LifecycleOnHold:
		return true
	default:
		return false
	}
}

// DeriveLifecycle maps status + EOL stage onto the unified life-cycle label.
func DeriveLifecycle(status VehicleStatus, stage *EOLWorkflowStage) VehicleLifecycle {
	switch status {
	case VehicleStatusPlanned:
		return LifecyclePlanned
	case VehicleStatusOnHold:
		return LifecycleOnHold
	case VehicleStatusDelivered, VehicleStatusShipped:
		return LifecycleDelivered
	case VehicleStatusInProduction:
		return LifecycleOnLine
	case VehicleStatusInWarehouse:
		if stage != nil && *stage == EOLStageCompleted {
			return LifecycleReadyToShip
		}
		return LifecycleAtDepot
	default:
		return LifecycleOnLine
	}
}
