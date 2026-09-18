package domain_test

import (
	"testing"

	"github.com/karea/backend/internal/domain"
)

// Every shop-floor AuditEvent constant must appear in WorkAuditEventTypes so a
// new work enum value cannot be added without deciding whether it blocks DELETE.
// Auth-only events (LOGIN_RATE_LIMITED) are intentionally excluded.
func TestWorkAuditEventTypesCoversAllConstants(t *testing.T) {
	t.Parallel()
	workEvents := []domain.AuditEvent{
		domain.AuditEventStatusChange,
		domain.AuditEventLocationChange,
		domain.AuditEventStationEnter,
		domain.AuditEventStationExit,
		domain.AuditEventChecklistItemUpdate,
		domain.AuditEventIssueStatusChange,
		domain.AuditEventIssueClassification,
		domain.AuditEventEOLWorkflowStage,
		domain.AuditEventMediaUploaded,
	}
	nonWork := []domain.AuditEvent{
		domain.AuditEventLoginRateLimited,
	}
	seen := make(map[domain.AuditEvent]bool, len(domain.WorkAuditEventTypes))
	for _, ev := range domain.WorkAuditEventTypes {
		if seen[ev] {
			t.Errorf("duplicate WorkAuditEventTypes entry %q", ev)
		}
		seen[ev] = true
	}
	if len(domain.WorkAuditEventTypes) != len(workEvents) {
		t.Errorf("WorkAuditEventTypes has %d entries, want %d work constants",
			len(domain.WorkAuditEventTypes), len(workEvents))
	}
	for _, ev := range workEvents {
		if !seen[ev] {
			t.Errorf("%q is a work AuditEvent but missing from WorkAuditEventTypes", ev)
		}
	}
	for _, ev := range nonWork {
		if seen[ev] {
			t.Errorf("%q must not block user DELETE (not a work event)", ev)
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
