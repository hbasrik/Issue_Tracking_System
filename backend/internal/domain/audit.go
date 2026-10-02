package domain

import "time"

// AuditEvent mirrors the audit_event_enum type.
type AuditEvent string

const (
	AuditEventStatusChange        AuditEvent = "STATUS_CHANGE"
	AuditEventLocationChange      AuditEvent = "LOCATION_CHANGE"
	AuditEventStationEnter        AuditEvent = "STATION_ENTER"
	AuditEventStationExit         AuditEvent = "STATION_EXIT"
	AuditEventChecklistItemUpdate AuditEvent = "CHECKLIST_ITEM_UPDATE"
	AuditEventIssueStatusChange   AuditEvent = "ISSUE_STATUS_CHANGE"
	AuditEventEOLWorkflowStage    AuditEvent = "EOL_WORKFLOW_STAGE_CHANGE"
	AuditEventMediaUploaded       AuditEvent = "MEDIA_UPLOADED"
	AuditEventIssueClassification AuditEvent = "ISSUE_CLASSIFICATION_CHANGE"
	// AuditEventLoginRateLimited records a blocked login (account lock or IP
	// ceiling). Not a shop-floor work event — omitted from WorkAuditEventTypes.
	AuditEventLoginRateLimited AuditEvent = "LOGIN_RATE_LIMITED"
)

// WorkAuditEventTypes is the allowlist of audit_logs.event_type values that
// count as real shop-floor work when deciding whether a user may be hard-
// deleted (Karar 7: audit_logs is the issue/vehicle history — there is no
// separate Issue_History table). LOGIN_RATE_LIMITED is auth telemetry only.
//
// When you add a value to audit_event_enum, add it here if the acting user
// must be retained. Omitting it means that event will not block DELETE.
var WorkAuditEventTypes = []AuditEvent{
	AuditEventStatusChange,        // vehicle global status
	AuditEventLocationChange,      // station/location move
	AuditEventStationEnter,        // line enter
	AuditEventStationExit,         // line exit
	AuditEventChecklistItemUpdate, // checklist tick / reject / approve
	AuditEventIssueStatusChange,   // issue lifecycle (Karar 7 history)
	AuditEventIssueClassification, // defect catalogue label corrections
	AuditEventEOLWorkflowStage,    // branch/depot/document sign-off
	AuditEventMediaUploaded,       // photo attached to an entity
}

// WorkAuditEventTypeStrings is WorkAuditEventTypes as plain strings for SQL.
func WorkAuditEventTypeStrings() []string {
	out := make([]string, len(WorkAuditEventTypes))
	for i, t := range WorkAuditEventTypes {
		out[i] = string(t)
	}
	return out
}

// AuditLog mirrors the append-only audit_logs table. Karar 1 dropped
// phase_number; location is now carried solely by StationID.
type AuditLog struct {
	ID          int64
	VIN         string
	EventType   AuditEvent
	OldValue    string
	NewValue    string
	StationID   *int
	PerformedBy *int
	EventAt     time.Time
	Metadata    map[string]any
}

// Issue history entry kinds.
const (
	IssueHistoryKindStatus         = "STATUS"
	IssueHistoryKindClassification = "CLASSIFICATION"
)

// Classification change fields, in display order. The responsible process is
// deliberately absent: it is stored and audited but not shown (docs/16 A33).
const (
	ClassificationFieldPart         = "part"
	ClassificationFieldType         = "type"
	ClassificationFieldCustomPart   = "custom_part"
	ClassificationFieldCustomDefect = "custom_defect"
	ClassificationFieldCode         = "code"
)

// ClassificationChange is one field of an ISSUE_CLASSIFICATION_CHANGE row with
// catalogue ids resolved to names. Free-text fields carry the same text in
// both languages; an empty side means "not set".
type ClassificationChange struct {
	Field  string
	FromTR string
	FromEN string
	ToTR   string
	ToEN   string
}

// IssueStatusHistoryEntry is one row of an issue's timeline, resolved with
// the acting user's name (Karar 7 — no separate history table). Kind STATUS
// uses FromStatus/ToStatus; kind CLASSIFICATION uses Changes (empty when the
// save changed nothing).
type IssueStatusHistoryEntry struct {
	ID         int64
	Kind       string
	FromStatus string
	ToStatus   string
	Changes    []ClassificationChange
	ActorName  string
	EventAt    time.Time
}

// VehicleStatusHistoryEntry is one STATUS_CHANGE row for a vehicle, resolved
// with the acting user's display name. Inactive users still resolve; a
// missing user row yields an empty ActorName rather than dropping the event.
type VehicleStatusHistoryEntry struct {
	ID         int64
	FromStatus string
	ToStatus   string
	ActorName  string
	EventAt    time.Time
}

// VehicleTimelineEventTypes are the audit rows shown on a vehicle's timeline.
var VehicleTimelineEventTypes = []AuditEvent{
	AuditEventStatusChange,
	AuditEventEOLWorkflowStage,
	AuditEventChecklistItemUpdate,
	AuditEventIssueStatusChange,
	AuditEventIssueClassification,
}

// VehicleTimelineLimit caps one timeline read; Truncated reports the rest.
const VehicleTimelineLimit = 1000

// VehicleTimelineEntry is one audit row of a vehicle's timeline with the
// metadata readers need already lifted out: checklist item number/text,
// issue id, resolved classification changes, and the action that caused a
// status change (hold, release, trigger, development reset). Raw stored
// values stay in Old/NewValue; clients translate them.
type VehicleTimelineEntry struct {
	ID             int64
	EventAt        time.Time
	EventType      string
	OldValue       string
	NewValue       string
	ActorName      string
	ChecklistType  string
	ItemNo         *int
	ItemText       string
	IssueID        *int64
	Classification []ClassificationChange
	// Action is metadata.action (place_on_hold, release_from_hold,
	// dev_reset, approval_undone, ...); Trigger is metadata.trigger
	// (eol_branch_ship, eol_deliver).
	Action         string
	Trigger        string
	HoldReason     string
	DevReset       bool
	OpenIssueCount *int
}

// VehicleTimeline is a newest-first timeline page.
type VehicleTimeline struct {
	Items     []VehicleTimelineEntry
	Truncated bool
}
