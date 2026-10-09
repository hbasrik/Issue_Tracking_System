package domain

import (
	"strings"
	"time"
	"unicode/utf8"
)

// ChecklistType mirrors the checklist_type_enum type.
type ChecklistType string

const (
	ChecklistTypeEOL ChecklistType = "EOL"
	// ChecklistTypeShipment is retired (Karar 33): the enum value stays in
	// the database, but Valid rejects it, so no API path accepts it.
	ChecklistTypeShipment ChecklistType = "SHIPMENT"
	// ChecklistTypeTest is Karar 4's third checklist. It reuses the same
	// template and progress machinery as the other two but, unlike them, is
	// informational quality tracking rather than a shipping gate.
	ChecklistTypeTest ChecklistType = "TEST"
)

// Valid reports whether the checklist type is one in use (EOL, TEST).
func (t ChecklistType) Valid() bool {
	switch t {
	case ChecklistTypeEOL, ChecklistTypeTest:
		return true
	default:
		return false
	}
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

// PreferredActiveTemplateID picks among active candidates already filtered to
// one checklist type: prefer a row whose VehicleModelID matches vehicleModelID,
// otherwise the generic (nil model) row. Lowest ID wins ties. Mirrors the SQL
// used by ResolveDefaultTemplateID and fn_assign_checklist_templates.
func PreferredActiveTemplateID(candidates []ChecklistTemplate, vehicleModelID *int) (int, error) {
	var bestSpecific, bestGeneric *ChecklistTemplate
	for i := range candidates {
		c := &candidates[i]
		if !c.IsActive {
			continue
		}
		if c.VehicleModelID == nil {
			if bestGeneric == nil || c.ID < bestGeneric.ID {
				bestGeneric = c
			}
			continue
		}
		if vehicleModelID != nil && *c.VehicleModelID == *vehicleModelID {
			if bestSpecific == nil || c.ID < bestSpecific.ID {
				bestSpecific = c
			}
		}
	}
	if bestSpecific != nil {
		return bestSpecific.ID, nil
	}
	if bestGeneric != nil {
		return bestGeneric.ID, nil
	}
	return 0, ErrNotFound
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

// MaxTemplateItemTextLen matches checklist_template_items.item_text VARCHAR(250).
const MaxTemplateItemTextLen = 250

// Valid reports whether the EoL item phase is BRANCH or DEPOT.
func (p EOLItemPhase) Valid() bool {
	switch p {
	case EOLItemPhaseBranch, EOLItemPhaseDepot:
		return true
	default:
		return false
	}
}

// ValidateTemplateItemFields enforces catalogue rules: non-empty text, EOL
// items must carry BRANCH/DEPOT, SHIPMENT/TEST items must not.
func ValidateTemplateItemFields(templateType ChecklistType, itemText string, phase *EOLItemPhase) error {
	if !templateType.Valid() {
		return ErrInvalidEnumValue
	}
	text := strings.TrimSpace(itemText)
	if text == "" {
		return ErrTemplateItemTextRequired
	}
	if utf8.RuneCountInString(text) > MaxTemplateItemTextLen {
		return ErrTemplateItemTextTooLong
	}
	if templateType == ChecklistTypeEOL {
		if phase == nil || !phase.Valid() {
			return ErrEOLPhaseRequired
		}
		return nil
	}
	if phase != nil {
		return ErrEOLPhaseNotAllowed
	}
	return nil
}

// MaxSectionKeyLen matches checklist_template_items.section_key VARCHAR(64).
const MaxSectionKeyLen = 64

// NormalizeSectionKey trims and lowercases a section id. Empty becomes nil
// (unsectioned). Invalid length returns ErrInvalidEnumValue.
func NormalizeSectionKey(raw *string) (*string, error) {
	if raw == nil {
		return nil, nil
	}
	s := strings.ToLower(strings.TrimSpace(*raw))
	if s == "" {
		return nil, nil
	}
	if utf8.RuneCountInString(s) > MaxSectionKeyLen {
		return nil, ErrInvalidEnumValue
	}
	return &s, nil
}

// ChecklistTemplateItem mirrors the checklist_template_items table.
type ChecklistTemplateItem struct {
	ID         int
	TemplateID int
	ItemNo     int16
	ItemText   string
	StationID  *int
	EolPhase   *EOLItemPhase
	// SectionKey groups items in the UI independently of ItemNo reorder.
	// Empty/nil = unsectioned ("Other items").
	SectionKey *string `json:"SectionKey,omitempty"`
	// SectionSort orders sections; not rewritten by item reorder.
	SectionSort *int16 `json:"SectionSort,omitempty"`
	IsActive    bool
	// EvaluatedCount is non-PENDING progress rows for this item (list join).
	// Used to warn before renaming catalogue text.
	EvaluatedCount int `json:"EvaluatedCount,omitempty"`
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
	ApprovedDesc    string
	RelatedIssueID  *int64
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

// ChecklistFrozenReason says why a checklist item is frozen (Karar 29). The
// stage rule is stage_applicability.go: every item of a delivered vehicle,
// EoL depot items after depot release, every other item after branch ship.
type ChecklistFrozenReason string

const (
	ChecklistFrozenDelivered     ChecklistFrozenReason = "DELIVERED"
	ChecklistFrozenBranchShipped ChecklistFrozenReason = "BRANCH_SHIPPED"
	ChecklistFrozenDepotReleased ChecklistFrozenReason = "DEPOT_RELEASED"
)

// Err returns the 409 sentinel for the reason, or nil when not frozen.
func (r ChecklistFrozenReason) Err() error {
	switch r {
	case ChecklistFrozenDelivered:
		return ErrChecklistFrozenDelivered
	case ChecklistFrozenBranchShipped:
		return ErrChecklistFrozenBranchShipped
	case ChecklistFrozenDepotReleased:
		return ErrChecklistFrozenDepotReleased
	}
	return nil
}

// ChecklistAnsweredCriteria is the form guidance an answer was given
// against, copied from the template item on every non-PENDING answer
// (Karar 30). A nil field means the form gave none at that time.
type ChecklistAnsweredCriteria struct {
	AcceptanceCriterion *string   `json:"AcceptanceCriterion,omitempty"`
	ControlMethod       *string   `json:"ControlMethod,omitempty"`
	FormRevision        *string   `json:"FormRevision,omitempty"`
	CopiedAt            time.Time `json:"CopiedAt"`
}

// ChecklistItemView is the operator-facing join of template items with
// per-vehicle checklist progress. EolPhase is set only for EoL items so the
// Vehicle Detail stepper can split Branch vs Depot without a second query.
// ProgressID is the checklist_item_progress row id, used as entity_id when
// attaching media (CHECKLIST_ITEM_PROGRESS). Actor names are joined in the
// list query so the UI never N+1s users.
// IsActive mirrors the catalogue flag: gates ignore inactive items; missing
// progress on an active item (ProgressID == nil) blocks the gate.
type ChecklistItemView struct {
	ItemID          int
	ItemNo          int16
	ItemText        string
	Status          CheckStatus
	ReworkDesc      string
	ConditionalDesc string
	RejectedDesc    string
	ApprovedDesc    string
	// Note is the description of the current answer, read from the column
	// that answer owns (ChecklistNotes). Clients should prefer it over the
	// per-answer fields above.
	Note        string
	EolPhase    *EOLItemPhase
	SectionKey  *string `json:"SectionKey,omitempty"`
	SectionSort *int16  `json:"SectionSort,omitempty"`
	// AcceptanceCriterion, ControlMethod and FormRevision are the template
	// item's current values from the printed form (Karar 30); nil when the
	// form gives none, so the UI shows nothing.
	AcceptanceCriterion *string `json:"AcceptanceCriterion,omitempty"`
	ControlMethod       *string `json:"ControlMethod,omitempty"`
	FormRevision        *string `json:"FormRevision,omitempty"`
	// AnsweredCriteria is the copy taken with the current answer; nil for
	// PENDING items and for answers given before the copy existed.
	AnsweredCriteria *ChecklistAnsweredCriteria `json:"AnsweredCriteria,omitempty"`
	ProgressID  *int64
	IsActive    bool
	// StageClosed marks an active item the vehicle can no longer complete:
	// its stage is passed and it was never evaluated (or the vehicle is
	// delivered and it is not passing). It counts in no total, gate or
	// warning; the row is kept as history.
	StageClosed    bool
	// FrozenReason is set once the item's stage is behind the vehicle
	// (Karar 29): its answer and photos can no longer change.
	FrozenReason   ChecklistFrozenReason `json:"FrozenReason,omitempty"`
	CheckerName    string     `json:"CheckerName,omitempty"`
	CheckDate      *time.Time `json:"CheckDate,omitempty"`
	RejectedByName string     `json:"RejectedByName,omitempty"`
	RejectedAt     *time.Time `json:"RejectedAt,omitempty"`
	ApprovedByName string     `json:"ApprovedByName,omitempty"`
	ApprovedAt     *time.Time `json:"ApprovedAt,omitempty"`
	// Photos are every CHECKLIST_ITEM_PROGRESS attachment of this row,
	// oldest first; empty (never nil) when there are none.
	Photos []MediaAttachment
}
