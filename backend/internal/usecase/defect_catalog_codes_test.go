package usecase_test

import (
	"context"
	"errors"
	"testing"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/usecase"
)

func TestCatalogAdmin_PartCodeMustMatchZone(t *testing.T) {
	ctx := context.Background()
	cases := []struct {
		code string
		want error
	}{
		{"40-77", domain.ErrDefectPartCodeFormat},
		{"ZZZ", domain.ErrDefectPartCodeFormat},
		{"10-7", domain.ErrDefectPartCodeFormat},
		{"10-001", domain.ErrDefectPartCodeFormat},
		{"10-00", domain.ErrDefectPartCodeFormat},
		{"10-AB", domain.ErrDefectPartCodeFormat},
		{"10-03", nil},
		{" 10-04 ", nil},
	}
	for _, tc := range cases {
		admin := usecase.NewDefectCatalogAdmin(newLifecycleCatalog(), nil, nil, nil)
		_, err := admin.CreatePart(ctx, usecase.UpsertPartInput{ZoneID: 1, Code: tc.code, NameTR: "Yeni " + tc.code, NameEN: "New " + tc.code, IsActive: true})
		if !errors.Is(err, tc.want) {
			t.Errorf("code %q: err = %v, want %v", tc.code, err, tc.want)
		}
	}
	admin := usecase.NewDefectCatalogAdmin(newLifecycleCatalog(), nil, nil, nil)
	_, err := admin.CreatePart(ctx, usecase.UpsertPartInput{ZoneID: 1, Code: "40-77", NameTR: "x", NameEN: "x", IsActive: true})
	if err == nil || err.Error() != "part code must be the zone code, a dash and two digits: expected 10-NN" {
		t.Errorf("message names the expected prefix: %v", err)
	}
}

func TestCatalogAdmin_PartCodeCheckedOnlyWhenChanged(t *testing.T) {
	cat := newLifecycleCatalog()
	cat.parts[12] = &domain.DefectPart{ID: 12, ZoneID: 1, Code: "ZZZ", NameTR: "Eski", NameEN: "Legacy", IsActive: true}
	admin := usecase.NewDefectCatalogAdmin(cat, nil, nil, nil)
	ctx := context.Background()

	if err := admin.UpdatePart(ctx, 12, usecase.UpsertPartInput{ZoneID: 1, Code: "ZZZ", NameTR: "Eski (yeni ad)", NameEN: "Legacy", IsActive: false}); err != nil {
		t.Fatalf("a legacy code must not block renaming or deactivating: %v", err)
	}
	if err := admin.UpdatePart(ctx, 12, usecase.UpsertPartInput{ZoneID: 1, Code: "ZZY", NameTR: "Eski", NameEN: "Legacy", IsActive: true}); !errors.Is(err, domain.ErrDefectPartCodeFormat) {
		t.Fatalf("changed code is validated: err = %v", err)
	}
	if err := admin.UpdatePart(ctx, 10, usecase.UpsertPartInput{ZoneID: 2, Code: "10-01", NameTR: "Kapı", NameEN: "Door", IsActive: true}); !errors.Is(err, domain.ErrDefectPartCodeFormat) {
		t.Fatalf("moving zone keeps the old prefix: err = %v", err)
	}
	if err := admin.UpdatePart(ctx, 10, usecase.UpsertPartInput{ZoneID: 2, Code: "20-02", NameTR: "Kapı", NameEN: "Door", IsActive: true}); err != nil {
		t.Fatalf("moving zone with the new prefix: %v", err)
	}
}

func TestCatalogAdmin_TypeCodeFormat(t *testing.T) {
	ctx := context.Background()
	for code, want := range map[string]error{"7": domain.ErrDefectTypeCodeFormat, "007": domain.ErrDefectTypeCodeFormat, "AB": domain.ErrDefectTypeCodeFormat, "00": domain.ErrDefectTypeCodeFormat, "10-01": domain.ErrDefectTypeCodeFormat, "10": nil} {
		admin := usecase.NewDefectCatalogAdmin(newLifecycleCatalog(), nil, nil, nil)
		_, err := admin.CreateType(ctx, usecase.UpsertTypeInput{Code: code, NameTR: "Yeni " + code, NameEN: "New " + code, IsActive: true})
		if !errors.Is(err, want) {
			t.Errorf("type code %q: err = %v, want %v", code, err, want)
		}
	}
	cat := newLifecycleCatalog()
	cat.types[7] = &domain.DefectType{ID: 7, Code: "X1", NameTR: "Eski tip", NameEN: "Legacy type", IsActive: true}
	admin := usecase.NewDefectCatalogAdmin(cat, nil, nil, nil)
	if err := admin.UpdateType(ctx, 7, usecase.UpsertTypeInput{Code: "X1", NameTR: "Eski tip 2", NameEN: "Legacy type", IsActive: true}); err != nil {
		t.Fatalf("legacy type code stays editable: %v", err)
	}
}

func TestCatalogAdmin_PartNameUniquePerZone(t *testing.T) {
	ctx := context.Background()
	cases := []struct {
		name   string
		zoneID int
		code   string
		nameTR string
		nameEN string
		want   error
	}{
		{"same name, other case and spaces", 1, "10-03", "  kapı ", "Door handle", domain.ErrDefectPartNameTaken},
		{"upper case Turkish", 1, "10-03", "KAPI", "Door handle", domain.ErrDefectPartNameTaken},
		{"exact same name", 1, "10-03", "Tampon", "x", domain.ErrDefectPartNameTaken},
		{"same EN name", 1, "10-03", "Kapı paneli", "DOOR", domain.ErrDefectPartNameTaken},
		{"same name in another zone", 2, "20-02", "Kapı", "Door", nil},
		{"new name", 1, "10-03", "Kapı kolu", "Door handle", nil},
	}
	for _, tc := range cases {
		admin := usecase.NewDefectCatalogAdmin(newLifecycleCatalog(), nil, nil, nil)
		_, err := admin.CreatePart(ctx, usecase.UpsertPartInput{ZoneID: tc.zoneID, Code: tc.code, NameTR: tc.nameTR, NameEN: tc.nameEN, IsActive: true})
		if !errors.Is(err, tc.want) {
			t.Errorf("%s: err = %v, want %v", tc.name, err, tc.want)
		}
	}

	cat := newLifecycleCatalog()
	cat.parts[11].IsActive = false
	admin := usecase.NewDefectCatalogAdmin(cat, nil, nil, nil)
	if _, err := admin.CreatePart(ctx, usecase.UpsertPartInput{ZoneID: 1, Code: "10-03", NameTR: "tampon", NameEN: "x", IsActive: true}); !errors.Is(err, domain.ErrDefectPartNameTaken) {
		t.Errorf("an inactive part's name is still taken: err = %v", err)
	}
	if err := admin.UpdatePart(ctx, 10, usecase.UpsertPartInput{ZoneID: 1, Code: "10-01", NameTR: "KAPI ", NameEN: "door", IsActive: true}); err != nil {
		t.Errorf("re-casing a part's own name is not a duplicate: %v", err)
	}
	if err := admin.UpdatePart(ctx, 10, usecase.UpsertPartInput{ZoneID: 1, Code: "10-01", NameTR: "Tampon", NameEN: "Door", IsActive: true}); !errors.Is(err, domain.ErrDefectPartNameTaken) {
		t.Errorf("renaming onto a sibling: err = %v", err)
	}
	if err := admin.UpdatePart(ctx, 20, usecase.UpsertPartInput{ZoneID: 1, Code: "10-03", NameTR: "Şasi", NameEN: "Chassis", IsActive: true}); err != nil {
		t.Errorf("moving a uniquely named part: %v", err)
	}
}

func TestCatalogAdmin_TypeNameUnique(t *testing.T) {
	ctx := context.Background()
	admin := usecase.NewDefectCatalogAdmin(newLifecycleCatalog(), nil, nil, nil)
	if _, err := admin.CreateType(ctx, usecase.UpsertTypeInput{Code: "10", NameTR: " BOŞLUK", NameEN: "Clearance", IsActive: true}); !errors.Is(err, domain.ErrDefectTypeNameTaken) {
		t.Errorf("duplicate type name: err = %v", err)
	}
	if _, err := admin.CreateType(ctx, usecase.UpsertTypeInput{Code: "10", NameTR: "Çizik", NameEN: "gap ", IsActive: true}); !errors.Is(err, domain.ErrDefectTypeNameTaken) {
		t.Errorf("duplicate EN type name: err = %v", err)
	}
	if err := admin.UpdateType(ctx, 1, usecase.UpsertTypeInput{Code: "01", NameTR: "boşluk", NameEN: "GAP", IsActive: true}); err != nil {
		t.Errorf("re-casing own type name: %v", err)
	}
	if err := admin.UpdateType(ctx, 1, usecase.UpsertTypeInput{Code: "01", NameTR: "Boya", NameEN: "Gap", IsActive: true}); !errors.Is(err, domain.ErrDefectTypeNameTaken) {
		t.Errorf("renaming onto another type: err = %v", err)
	}
}

func TestCatalogAdmin_PromoteOtherChecksCodeAndName(t *testing.T) {
	ctx := context.Background()
	admin := usecase.NewDefectCatalogAdmin(newLifecycleCatalog(), nil, nil, nil)
	part := func(code, name string) error {
		_, err := admin.PromoteOther(ctx, usecase.PromoteOtherInput{Kind: "part", CustomName: "serbest", Code: code, NameTR: name, NameEN: name, ZoneID: 1})
		return err
	}
	if err := part("40-77", "Ayna"); !errors.Is(err, domain.ErrDefectPartCodeFormat) {
		t.Errorf("promote part wrong prefix: err = %v", err)
	}
	if err := part("10-03", "kapı"); !errors.Is(err, domain.ErrDefectPartNameTaken) {
		t.Errorf("promote part duplicate name: err = %v", err)
	}
	typ := func(code, name string) error {
		_, err := admin.PromoteOther(ctx, usecase.PromoteOtherInput{Kind: "type", CustomName: "serbest", Code: code, NameTR: name, NameEN: name})
		return err
	}
	if err := typ("ZZ", "Çatlak"); !errors.Is(err, domain.ErrDefectTypeCodeFormat) {
		t.Errorf("promote type wrong code: err = %v", err)
	}
	if err := typ("10", "BOYA"); !errors.Is(err, domain.ErrDefectTypeNameTaken) {
		t.Errorf("promote type duplicate name: err = %v", err)
	}
}
