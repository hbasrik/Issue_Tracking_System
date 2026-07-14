package domain

import "time"

// AuditEvent mirrors the audit_event_enum type.
type AuditEvent string

const (
	AuditEventStatusChange       AuditEvent = "STATUS_CHANGE"
	AuditEventLocationChange     AuditEvent = "LOCATION_CHANGE"
	AuditEventPhaseEnter         AuditEvent = "PHASE_ENTER"
	AuditEventPhaseExit          AuditEvent = "PHASE_EXIT"
	AuditEventStationEnter       AuditEvent = "STATION_ENTER"
	AuditEventStationExit        AuditEvent = "STATION_EXIT"
	AuditEventChecklistItemUpdate AuditEvent = "CHECKLIST_ITEM_UPDATE"
	AuditEventIssueStatusChange  AuditEvent = "ISSUE_STATUS_CHANGE"
)

// AuditLog mirrors the append-only audit_logs table.
type AuditLog struct {
	ID          int64
	VIN         string
	EventType   AuditEvent
	OldValue    string
	NewValue    string
	PhaseNumber *int16
	StationID   *int
	PerformedBy *int
	EventAt     time.Time
	Metadata    map[string]any
}
