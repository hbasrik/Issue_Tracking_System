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
)

// WorkAuditEventTypes is the allowlist of audit_logs.event_type values that
// count as real shop-floor work when deciding whether a user may be hard-
// deleted (Karar 7: audit_logs is the issue/vehicle history — there is no
// separate Issue_History table). Login/session is not written to this table.
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

// IssueStatusHistoryEntry is one ISSUE_STATUS_CHANGE row for an issue,
// resolved with the acting user's name (Karar 7 — no separate history table).
type IssueStatusHistoryEntry struct {
	ID         int64
	FromStatus string
	ToStatus   string
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
