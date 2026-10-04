package usecase_test

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/usecase"
)

func catalogDetailAt(t *testing.T, audit *fakeAuditRepo, i int) domain.AdminAuditDetail {
	t.Helper()
	entries := audit.Entries()
	if i >= len(entries) {
		t.Fatalf("audit rows = %d, want > %d", len(entries), i)
	}
	e := entries[i]
	if e.EventType != domain.AuditEventDefectCatalog || e.VIN != "" || e.PerformedBy == nil || *e.PerformedBy != 4 {
		t.Fatalf("entry = %+v", e)
	}
	raw, _ := json.Marshal(e.Metadata)
	var d domain.AdminAuditDetail
	if err := json.Unmarshal(raw, &d); err != nil {
		t.Fatal(err)
	}
	return d
}

func changeMap(d domain.AdminAuditDetail) map[string]domain.AdminFieldChange {
	out := map[string]domain.AdminFieldChange{}
	for _, c := range d.Changes {
		out[c.Field] = c
	}
	return out
}

func TestCatalogAudit_PartRenameAndMoveUseNames(t *testing.T) {
	cat := newLifecycleCatalog()
	cat.zones[2].NameEN = "Chassis"
	cat.zones[1].NameEN = "Body"
	audit := newFakeAuditRepo()
	admin := usecase.NewDefectCatalogAdmin(cat, nil, audit, nil)

	if err := admin.UpdatePart(context.Background(), 10, usecase.UpsertPartInput{
		ZoneID: 2, Code: "20-02", NameTR: "Ön kapı", NameEN: "Door", IsActive: true, ActorID: 4,
	}); err != nil {
		t.Fatalf("UpdatePart: %v", err)
	}
	d := catalogDetailAt(t, audit, 0)
	ch := changeMap(d)
	if d.Action != domain.AdminActionUpdate || d.Entity != domain.AdminEntityPart || d.Subject.TR != "Kapı" {
		t.Fatalf("detail = %+v", d)
	}
	if ch[domain.AdminFieldName].From.TR != "Kapı" || ch[domain.AdminFieldName].To.TR != "Ön kapı" {
		t.Fatalf("name = %+v", ch[domain.AdminFieldName])
	}
	if ch[domain.AdminFieldCode].From.Code != "10-01" || ch[domain.AdminFieldCode].To.Code != "20-02" {
		t.Fatalf("code = %+v", ch[domain.AdminFieldCode])
	}
	if ch[domain.AdminFieldZone].From.TR != "Body" || ch[domain.AdminFieldZone].To.TR != "Şasi" {
		t.Fatalf("zone = %+v", ch[domain.AdminFieldZone])
	}
	if _, listed := ch[domain.AdminFieldActive]; listed {
		t.Fatalf("unchanged active flag listed: %+v", ch)
	}
}

func TestCatalogAudit_TypeDeactivateAndProcessChange(t *testing.T) {
	cat := newLifecycleCatalog()
	cat.processes[3].NameTR, cat.processes[3].NameEN = "Montaj", "Assembly"
	cat.processes[4].NameTR, cat.processes[4].NameEN = "Boya", "Paint"
	audit := newFakeAuditRepo()
	admin := usecase.NewDefectCatalogAdmin(cat, nil, audit, nil)
	ctx := context.Background()

	if err := admin.UpdateType(ctx, 5, usecase.UpsertTypeInput{
		Code: "05", NameTR: "Eksik parça", NameEN: "Missing", DefaultProcessID: ptr(3), IsActive: false, ActorID: 4,
	}); err != nil {
		t.Fatalf("UpdateType: %v", err)
	}
	if d := catalogDetailAt(t, audit, 0); d.Action != domain.AdminActionDeactivate || len(d.Changes) != 1 {
		t.Fatalf("deactivate = %+v", d)
	}

	if err := admin.UpdateType(ctx, 2, usecase.UpsertTypeInput{
		Code: "02", NameTR: "Boya", NameEN: "Paint", DefaultProcessID: ptr(3), IsActive: true, ActorID: 4,
	}); err != nil {
		t.Fatalf("UpdateType: %v", err)
	}
	c := changeMap(catalogDetailAt(t, audit, 1))[domain.AdminFieldDefaultProcess]
	if c.From.TR != "Boya" || c.To.TR != "Montaj" || c.To.EN != "Assembly" {
		t.Fatalf("process = %+v", c)
	}

	// The fake does not persist updates: type 2 still holds process 4.
	if err := admin.UpdateType(ctx, 2, usecase.UpsertTypeInput{
		Code: "02", NameTR: "Boya", NameEN: "Paint", DefaultProcessID: ptr(4), IsActive: true, ActorID: 4,
	}); err != nil {
		t.Fatalf("UpdateType: %v", err)
	}
	if n := len(audit.Entries()); n != 2 {
		t.Fatalf("unchanged save wrote a row: %d rows", n)
	}
}

func TestCatalogAudit_CreateTypeRecordsNames(t *testing.T) {
	cat := newLifecycleCatalog()
	audit := newFakeAuditRepo()
	admin := usecase.NewDefectCatalogAdmin(cat, nil, audit, nil)

	if _, err := admin.CreateType(context.Background(), usecase.UpsertTypeInput{
		Code: "30", NameTR: "Çizik", NameEN: "Scratch", IsActive: true, ActorID: 4,
	}); err != nil {
		t.Fatalf("CreateType: %v", err)
	}
	d := catalogDetailAt(t, audit, 0)
	ch := changeMap(d)
	if d.Action != domain.AdminActionCreate || d.Subject.Code != "30" || d.Subject.EN != "Scratch" ||
		ch[domain.AdminFieldName].To.TR != "Çizik" || ch[domain.AdminFieldActive].To.Code != "true" {
		t.Fatalf("create = %+v", d)
	}
}

func TestCatalogAudit_RejectedEditWritesNothing(t *testing.T) {
	cat := newLifecycleCatalog()
	audit := newFakeAuditRepo()
	admin := usecase.NewDefectCatalogAdmin(cat, nil, audit, nil)
	_ = admin.DeleteZone(context.Background(), 4, 9)
	if n := len(audit.Entries()); n != 0 {
		t.Fatalf("rejected delete wrote %d rows", n)
	}
}
