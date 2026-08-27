package domain_test

import (
	"testing"

	"github.com/karea/backend/internal/domain"
)

// Every declared AuditEvent constant must appear in WorkAuditEventTypes so a
// new enum value cannot be added without deciding whether it blocks DELETE.
func TestWorkAuditEventTypesCoversAllConstants(t *testing.T) {
	t.Parallel()
	declared := []domain.AuditEvent{
		domain.AuditEventStatusChange,
		domain.AuditEventLocationChange,
		domain.AuditEventStationEnter,
		domain.AuditEventStationExit,
		domain.AuditEventChecklistItemUpdate,
		domain.AuditEventIssueStatusChange,
		domain.AuditEventEOLWorkflowStage,
		domain.AuditEventMediaUploaded,
	}
	seen := make(map[domain.AuditEvent]bool, len(domain.WorkAuditEventTypes))
	for _, ev := range domain.WorkAuditEventTypes {
		if seen[ev] {
			t.Errorf("duplicate WorkAuditEventTypes entry %q", ev)
		}
		seen[ev] = true
	}
	if len(domain.WorkAuditEventTypes) != len(declared) {
		t.Errorf("WorkAuditEventTypes has %d entries, want %d declared constants",
			len(domain.WorkAuditEventTypes), len(declared))
	}
	for _, ev := range declared {
		if !seen[ev] {
			t.Errorf("%q is a declared AuditEvent but missing from WorkAuditEventTypes", ev)
		}
	}
}

func TestWorkAuditEventTypeStrings(t *testing.T) {
	t.Parallel()
	got := domain.WorkAuditEventTypeStrings()
	if len(got) != len(domain.WorkAuditEventTypes) {
		t.Fatalf("len = %d, want %d", len(got), len(domain.WorkAuditEventTypes))
	}
	for i, ev := range domain.WorkAuditEventTypes {
		if got[i] != string(ev) {
			t.Errorf("[%d] = %q, want %q", i, got[i], ev)
		}
	}
}
