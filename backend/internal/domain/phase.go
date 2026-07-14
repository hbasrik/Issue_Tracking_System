package domain

// TotalPhases is the fixed number of production phases (each worth 12.5%).
const TotalPhases int16 = 8

// Phase mirrors the phases table.
type Phase struct {
	PhaseNumber int16
	Name        string
}

// Station mirrors the stations table. PhaseNumber is nullable because some
// stations (e.g. EoL, Shipment bay) do not map 1:1 to a production phase.
type Station struct {
	ID          int
	Name        string
	PhaseNumber *int16
}
