package domain

import "time"

// EOLWorkflowStage mirrors the eol_workflow_stage_enum type. Karar 2 replaces
// v1's single EoL gate with three sequential stages, each with its own
// transition rule: branch shipment warns on open issues, depot release is a
// hard block, and document approval is the final sign-off.
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
// plus each stage's timestamp and actor.
type EOLWorkflowView struct {
	VIN          string           `json:"vin"`
	CurrentStage EOLWorkflowStage `json:"current_stage"`

	BranchShip      EOLStageRecord `json:"branch_ship"`
	DepotRelease    EOLStageRecord `json:"depot_release"`
	DocumentApprove EOLStageRecord `json:"document_approve"`

	// BranchOpenIssueCountAtShipment lets the UI keep showing the
	// soft-warning banner after the fact.
	BranchOpenIssueCountAtShipment *int `json:"branch_open_issue_count_at_shipment"`
}
