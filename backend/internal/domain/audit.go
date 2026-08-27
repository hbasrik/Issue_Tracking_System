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
