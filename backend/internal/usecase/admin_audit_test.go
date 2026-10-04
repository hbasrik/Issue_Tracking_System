package usecase_test

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/usecase"
)

func newAuditedAdmin(audit *fakeAuditRepo, users ...*domain.User) (*usecase.UserAdmin, *adminUserRepo) {
	byID := make(map[int]*domain.User, len(users))
	for _, u := range users {
		copied := *u
		byID[u.ID] = &copied
	}
	repo := &adminUserRepo{users: byID}
	return usecase.NewUserAdmin(repo, adminRoleRepo{}, audit, nil, nil), repo
}

func namedUser(id int, name, email string, role domain.Role, active bool) *domain.User {
	return &domain.User{ID: id, FullName: name, Email: email, Role: role, IsActive: active}
}

func onlyEntry(t *testing.T, audit *fakeAuditRepo) domain.AuditLog {
	t.Helper()
	entries := audit.Entries()
	if len(entries) != 1 {
		t.Fatalf("audit rows = %d, want 1: %+v", len(entries), entries)
	}
	e := entries[0]
	if e.EventType != domain.AuditEventUserAdmin {
		t.Fatalf("event = %s", e.EventType)
	}
	if e.VIN != "" || e.OldValue != "" || e.NewValue != "" {
		t.Fatalf("vin/old/new must stay empty: %+v", e)
	}
	return e
}

func changesOf(t *testing.T, e domain.AuditLog) map[string]domain.AdminFieldChange {
	t.Helper()
	raw, _ := json.Marshal(e.Metadata)
	var d domain.AdminAuditDetail
	if err := json.Unmarshal(raw, &d); err != nil {
		t.Fatalf("metadata: %v", err)
	}
	out := map[string]domain.AdminFieldChange{}
	for _, c := range d.Changes {
		out[c.Field] = c
	}
	return out
}

func TestUserAdminAudit_RoleChange(t *testing.T) {
	audit := newFakeAuditRepo()
	admin, _ := newAuditedAdmin(audit,
		namedUser(1, "Ayşe Yönetici", "ayse@karea.local", managerRole, true),
		namedUser(2, "Mehmet Usta", "mehmet@karea.local", operatorRole, true))

	if _, err := admin.Update(context.Background(), 1, 2, usecase.UpdateUserInput{Role: ptr(domain.RoleCodeManagerAdmin)}); err != nil {
		t.Fatalf("Update: %v", err)
	}
	e := onlyEntry(t, audit)
	if e.PerformedBy == nil || *e.PerformedBy != 1 {
		t.Fatalf("performed_by = %v", e.PerformedBy)
	}
	if e.Metadata["action"] != domain.AdminActionRoleChange || e.Metadata["entity"] != domain.AdminEntityUser {
		t.Fatalf("metadata = %v", e.Metadata)
	}
	subject, _ := e.Metadata["subject"].(map[string]any)
	if subject["tr"] != "Mehmet Usta" || e.Metadata["subject_email"] != "mehmet@karea.local" {
		t.Fatalf("subject = %v", e.Metadata)
	}
	c := changesOf(t, e)[domain.AdminFieldRole]
	if c.From.TR != "Operator" || c.To.TR != "Manager/Admin" || c.To.Code != domain.RoleCodeManagerAdmin {
		t.Fatalf("role change = %+v", c)
	}
	if len(changesOf(t, e)) != 1 {
		t.Fatalf("unchanged active flag must not be listed: %+v", changesOf(t, e))
	}
}

func TestUserAdminAudit_DeactivateAndNoOp(t *testing.T) {
	audit := newFakeAuditRepo()
	admin, _ := newAuditedAdmin(audit,
		namedUser(1, "Ayşe", "a@karea.local", managerRole, true),
		namedUser(2, "Mehmet", "m@karea.local", operatorRole, true))

	if _, err := admin.Update(context.Background(), 1, 2, usecase.UpdateUserInput{IsActive: ptr(true)}); err != nil {
		t.Fatalf("no-op Update: %v", err)
	}
	if n := len(audit.Entries()); n != 0 {
		t.Fatalf("no-op wrote %d rows", n)
	}
	if _, err := admin.Update(context.Background(), 1, 2, usecase.UpdateUserInput{IsActive: ptr(false)}); err != nil {
		t.Fatalf("Update: %v", err)
	}
	e := onlyEntry(t, audit)
	c := changesOf(t, e)[domain.AdminFieldActive]
	if e.Metadata["action"] != domain.AdminActionDeactivate || c.From.Code != "true" || c.To.Code != "false" {
		t.Fatalf("metadata = %v", e.Metadata)
	}
}

func TestUserAdminAudit_CreateNeverStoresPassword(t *testing.T) {
	audit := newFakeAuditRepo()
	admin, repo := newAuditedAdmin(audit, namedUser(1, "Ayşe", "a@karea.local", managerRole, true))

	created, err := admin.Create(context.Background(), usecase.CreateUserInput{
		FullName: "Yeni Operatör", Email: "yeni@karea.local", Role: domain.RoleCodeOperator, ActorID: 1,
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	e := onlyEntry(t, audit)
	if e.Metadata["action"] != domain.AdminActionCreate || *e.PerformedBy != 1 {
		t.Fatalf("metadata = %v", e.Metadata)
	}
	ch := changesOf(t, e)
	if ch[domain.AdminFieldName].To.TR != "Yeni Operatör" || ch[domain.AdminFieldRole].To.Code != domain.RoleCodeOperator {
		t.Fatalf("changes = %+v", ch)
	}
	assertNoSecret(t, e, created.TemporaryPassword, repo.users[created.User.ID].PasswordHash)
}

func TestUserAdminAudit_PasswordResetRecordsOnlyTheFact(t *testing.T) {
	audit := newFakeAuditRepo()
	admin, repo := newAuditedAdmin(audit,
		namedUser(1, "Ayşe", "a@karea.local", managerRole, true),
		namedUser(2, "Mehmet", "m@karea.local", operatorRole, true))

	plain, err := admin.ResetPassword(context.Background(), 1, 2)
	if err != nil {
		t.Fatalf("ResetPassword: %v", err)
	}
	e := onlyEntry(t, audit)
	if e.Metadata["action"] != domain.AdminActionPasswordReset || e.Metadata["changes"] != nil {
		t.Fatalf("metadata = %v", e.Metadata)
	}
	assertNoSecret(t, e, plain, repo.users[2].PasswordHash)
}

func TestUserAdminAudit_DeleteSnapshotsTheUser(t *testing.T) {
	audit := newFakeAuditRepo()
	admin, _ := newAuditedAdmin(audit,
		namedUser(1, "Ayşe", "a@karea.local", managerRole, true),
		namedUser(2, "Mehmet", "m@karea.local", operatorRole, false))

	if err := admin.Delete(context.Background(), 1, 2); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	e := onlyEntry(t, audit)
	ch := changesOf(t, e)
	if e.Metadata["action"] != domain.AdminActionDelete ||
		ch[domain.AdminFieldName].From.TR != "Mehmet" || !ch[domain.AdminFieldName].To.IsZero() ||
		ch[domain.AdminFieldRole].From.TR != "Operator" {
		t.Fatalf("metadata = %v", e.Metadata)
	}
}

func TestUserAdminAudit_LoginUnlock(t *testing.T) {
	audit := newFakeAuditRepo()
	admin, _ := newAuditedAdmin(audit, namedUser(2, "Mehmet", "m@karea.local", operatorRole, true))
	target, _ := admin.GetByID(context.Background(), 2)
	if err := admin.RecordLoginUnlock(context.Background(), 1, target); err != nil {
		t.Fatalf("RecordLoginUnlock: %v", err)
	}
	if e := onlyEntry(t, audit); e.Metadata["action"] != domain.AdminActionLoginUnlock {
		t.Fatalf("metadata = %v", e.Metadata)
	}
}

func assertNoSecret(t *testing.T, e domain.AuditLog, secrets ...string) {
	t.Helper()
	raw, _ := json.Marshal(e)
	for _, s := range secrets {
		if s == "" {
			t.Fatalf("empty secret passed to assertNoSecret")
		}
		if strings.Contains(string(raw), s) {
			t.Fatalf("audit row contains a password or hash: %s", raw)
		}
	}
	if strings.Contains(string(raw), "$2a$") || strings.Contains(string(raw), "$2b$") {
		t.Fatalf("audit row contains a bcrypt hash: %s", raw)
	}
	var walk func(v any)
	walk = func(v any) {
		switch x := v.(type) {
		case map[string]any:
			for k, inner := range x {
				lk := strings.ToLower(k)
				if strings.Contains(lk, "password") || strings.Contains(lk, "hash") {
					t.Fatalf("audit metadata has key %q: %s", k, raw)
				}
				walk(inner)
			}
		case []any:
			for _, inner := range x {
				walk(inner)
			}
		}
	}
	walk(e.Metadata)
}
