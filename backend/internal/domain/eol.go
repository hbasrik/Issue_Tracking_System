package domain

import "time"

// EOLWorkflowStage mirrors the eol_workflow_stage_enum type. Live flow is
// BRANCH → DEPOT → COMPLETED. DOCUMENT remains a valid enum value for rows
// written before the document stage was removed from the product.
type EOLWorkflowStage string

const (
	EOLStageBranch    EOLWorkflowStage = "BRANCH"
	EOLStageDepot     EOLWorkflowStage = "DEPOT"
	EOLStageDocument  EOLWorkflowStage = "DOCUMENT"
	EOLStageCompleted EOLWorkflowStage = "COMPLETED"
)

// Valid reports whether the stage is a known enum value.
func (s EOLWorkflowStage) Valid() bool {
	switch s {
	case EOLStageBranch, EOLStageDepot, EOLStageDocument, EOLStageCompleted:
		return true
	default:
		return false
	}
}

// FilterValid reports whether the stage may be used as a vehicle-list filter
// (user-facing BRANCH / DEPOT / COMPLETED only).
func (s EOLWorkflowStage) FilterValid() bool {
	switch s {
	case EOLStageBranch, EOLStageDepot, EOLStageCompleted:
		return true
	default:
		return false
	}
}

// EOLWorkflow mirrors the vehicle_eol_workflow table. One row is created per
// vehicle by the fn_initialize_vehicle_progress trigger.
type EOLWorkflow struct {
	VIN          string
	CurrentStage EOLWorkflowStage

	BranchShippedAt *time.Time
	BranchShippedBy *int
	// BranchOpenIssueCountAtShipment is the soft-warning snapshot: how many
	// issues were still open when the branch shipped. It is recorded rather
	// than enforced.
	BranchOpenIssueCountAtShipment *int

	DepotReleasedAt *time.Time
	DepotReleasedBy *int

	DocumentApprovedAt *time.Time
	DocumentApprovedBy *int

	DeliveredAt *time.Time
	DeliveredBy *int

	CreatedAt time.Time
	UpdatedAt time.Time
}

// EOLStageRecord is one completed stage: when it happened and who did it.
type EOLStageRecord struct {
	At       *time.Time `json:"at"`
	ByUserID *int       `json:"by_user_id"`
	ByName   string     `json:"by_name,omitempty"`
}

// EOLWorkflowView is the Vehicle Detail EoL tab payload: the current stage
// plus each stage's timestamp and actor, plus server-computed gate status so
// web and mobile never re-derive readiness locally.
type EOLWorkflowView struct {
	VIN          string           `json:"vin"`
	CurrentStage EOLWorkflowStage `json:"current_stage"`

	BranchShip      EOLStageRecord `json:"branch_ship"`
	DepotRelease    EOLStageRecord `json:"depot_release"`
	DocumentApprove EOLStageRecord `json:"document_approve"`
	Deliver         EOLStageRecord `json:"deliver"`

	// BranchOpenIssueCountAtShipment lets the UI keep showing the
	// soft-warning banner after the fact.
	BranchOpenIssueCountAtShipment *int `json:"branch_open_issue_count_at_shipment"`

	// Gates is the single source of truth for ship / release / deliver
	// readiness. Counts match fn_enforce_branch_shipment /
	// fn_enforce_depot_release (migration 0022).
	Gates EOLGates `json:"gates"`
}

// EOLGates aggregates per-action readiness for the EoL workflow UI.
type EOLGates struct {
	BranchShip   EOLBranchShipGate   `json:"branch_ship"`
	DepotRelease EOLDepotReleaseGate `json:"depot_release"`
	Deliver      EOLDeliverGate      `json:"deliver"`
}

// EOLBranchShipGate mirrors the hard blockers in fn_enforce_branch_shipment.
// OpenIssueCount is informational only (soft warning on ship).
type EOLBranchShipGate struct {
	Ready                 bool `json:"ready"`
	AlreadyDone           bool `json:"already_done"`
	BranchEOLRemaining    int  `json:"branch_eol_remaining"`
	BranchEOLMissing      int  `json:"branch_eol_missing"`
	TestRemaining         int  `json:"test_remaining"`
	TestMissing           int  `json:"test_missing"`
	ShipmentRemaining     int  `json:"shipment_remaining"`
	ShipmentMissing       int  `json:"shipment_missing"`
	StationStepsRemaining int  `json:"station_steps_remaining"`
	OpenIssueCount        int  `json:"open_issue_count"`
}

// EOLDepotReleaseGate mirrors the hard blockers in fn_enforce_depot_release.
type EOLDepotReleaseGate struct {
	Ready              bool `json:"ready"`
	AlreadyDone        bool `json:"already_done"`
	NeedsBranchShip    bool `json:"needs_branch_ship"`
	DepotEOLRemaining  int  `json:"depot_eol_remaining"`
	DepotEOLMissing    int  `json:"depot_eol_missing"`
	OpenIssueCount     int  `json:"open_issue_count"`
}

// EOLDeliverGate is application-layer only (no DB trigger); deliver requires
// depot release and must not already be delivered.
type EOLDeliverGate struct {
	Ready             bool `json:"ready"`
	AlreadyDone       bool `json:"already_done"`
	NeedsDepotRelease bool `json:"needs_depot_release"`
}
