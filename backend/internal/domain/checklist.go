package domain

import "time"

// ChecklistType mirrors the checklist_type_enum type.
type ChecklistType string

const (
	ChecklistTypeEOL      ChecklistType = "EOL"
	ChecklistTypeShipment ChecklistType = "SHIPMENT"
	// ChecklistTypeTest is Karar 4's third checklist. It reuses the same
	// template and progress machinery as the other two but, unlike them, is
	// informational quality tracking rather than a shipping gate.
	ChecklistTypeTest ChecklistType = "TEST"
)

// Valid reports whether the checklist type is a known enum value.
func (t ChecklistType) Valid() bool {
	switch t {
	case ChecklistTypeEOL, ChecklistTypeShipment, ChecklistTypeTest:
		return true
	default:
		return false
	}
}

// HasStatusGate reports whether completing this checklist unlocks a vehicle
// status transition. EoL and Shipment are hard-block gates (FR-3.5/FR-4.3);
// the Test checklist deliberately has none, so its results never move a
// vehicle through the status machine.
func (t ChecklistType) HasStatusGate() bool {
	return t == ChecklistTypeEOL || t == ChecklistTypeShipment
}

// CheckStatus mirrors the check_status_enum type.
type CheckStatus string

const (
	CheckStatusPending       CheckStatus = "PENDING"
	CheckStatusOK            CheckStatus = "OK"
	CheckStatusNotOK         CheckStatus = "NOT_OK"
	CheckStatusRework        CheckStatus = "REWORK"
	CheckStatusConditionalOK CheckStatus = "CONDITIONAL_OK"
)

// Valid reports whether the check status is a known enum value.
func (s CheckStatus) Valid() bool {
	switch s {
	case CheckStatusPending, CheckStatusOK, CheckStatusNotOK,
		CheckStatusRework, CheckStatusConditionalOK:
		return true
	default:
		return false
	}
}

// IsPassing reports whether the status satisfies a quality gate. Per the
// EoL/Shipment hard-block rule (FR-3.5/FR-4.3), only OK and CONDITIONAL_OK
// count as passing.
func (s CheckStatus) IsPassing() bool {
	return s == CheckStatusOK || s == CheckStatusConditionalOK
}

// ChecklistTemplate mirrors the checklist_templates table (multi-template
// architecture, resolved per vehicle_model_id).
type ChecklistTemplate struct {
	ID             int
	VehicleModelID *int
	Type           ChecklistType
	Name           string
	IsActive       bool
}

// ChecklistTemplateSummary is the /templates admin row: a template plus the
// live count of its active items, so the page never has to hardcode 13/43.
type ChecklistTemplateSummary struct {
	ID             int
	VehicleModelID *int
	Type           ChecklistType
	Name           string
	IsActive       bool
	ItemCount      int
}

// EOLItemPhase tags an EoL checklist item as Branch or Depot (Karar 2).
// Document approval has no checklist of its own.
type EOLItemPhase string

const (
	EOLItemPhaseBranch EOLItemPhase = "BRANCH"
	EOLItemPhaseDepot  EOLItemPhase = "DEPOT"
)

// ChecklistTemplateItem mirrors the checklist_template_items table.
type ChecklistTemplateItem struct {
	ID         int
	TemplateID int
	ItemNo     int16
	ItemText   string
	StationID  *int
	EolPhase   *EOLItemPhase
	IsActive   bool
}

// ChecklistProgress mirrors the checklist_item_progress table: a
// vehicle-scoped evaluation of a single checklist item.
type ChecklistProgress struct {
	ID              int64
	VIN             string
	ChecklistType   ChecklistType
	CheckItemID     int
	CheckStatus     CheckStatus
	CheckerID       *int
	CheckDate       *time.Time
	ReworkDesc      string
	ConditionalDesc string
	RejectedDesc    string
	RelatedIssueID  *int64
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

// ChecklistItemView is the operator-facing join of template items with
// per-vehicle checklist progress. EolPhase is set only for EoL items so the
// Vehicle Detail stepper can split Branch vs Depot without a second query.
type ChecklistItemView struct {
	ItemID          int
	ItemNo          int16
	ItemText        string
	Status          CheckStatus
	ReworkDesc      string
	ConditionalDesc string
	RejectedDesc    string
	EolPhase        *EOLItemPhase
}
