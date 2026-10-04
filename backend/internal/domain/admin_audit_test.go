package domain_test

import (
	"testing"

	"github.com/karea/backend/internal/domain"
)

func TestActivityVisibleEventTypes(t *testing.T) {
	t.Parallel()
	has := func(list []domain.AuditEvent, ev domain.AuditEvent) bool {
		for _, e := range list {
			if e == ev {
				return true
			}
		}
		return false
	}
	analyst := domain.ActivityVisibleEventTypes(false)
	manager := domain.ActivityVisibleEventTypes(true)
	for _, ev := range domain.MasterDataAuditEventTypes {
		if !has(analyst, ev) || !has(manager, ev) {
			t.Errorf("%s must be visible with analysis.view", ev)
		}
	}
	for _, ev := range domain.SensitiveAdminAuditEventTypes {
		if has(analyst, ev) {
			t.Errorf("%s must need admin.manage_users", ev)
		}
		if !has(manager, ev) {
			t.Errorf("%s missing for admin.manage_users", ev)
		}
	}
	if has(manager, domain.AuditEventLoginRateLimited) {
		t.Error("login telemetry is not activity")
	}
	for _, ev := range domain.ActivityWorkEventTypes {
		if domain.IsAdminAuditEvent(string(ev)) {
			t.Errorf("%s is not a management event", ev)
		}
	}
}

func TestAdminAuditDetail_MetadataAndChanges(t *testing.T) {
	t.Parallel()
	d := domain.AdminAuditDetail{Action: domain.AdminActionUpdate, Entity: domain.AdminEntityZone, EntityID: 3}
	d.AddChange(domain.AdminFieldName, domain.AdminNames("", "Gövde", "Body"), domain.AdminNames("", "Gövde", "Body"))
	d.AddChange(domain.AdminFieldActive, domain.AdminBool(true), domain.AdminBool(false))
	if len(d.Changes) != 1 || d.Changes[0].Field != domain.AdminFieldActive {
		t.Fatalf("equal values must be skipped: %+v", d.Changes)
	}
	m := d.Metadata()
	if m["action"] != "update" || m["entity"] != "zone" || m["entity_id"] != float64(3) {
		t.Fatalf("metadata = %v", m)
	}
	changes, _ := m["changes"].([]any)
	first, _ := changes[0].(map[string]any)
	from, _ := first["from"].(map[string]any)
	if first["field"] != "is_active" || from["code"] != "true" {
		t.Fatalf("change = %v", first)
	}
}
