package domain_test

import (
	"testing"

	"github.com/karea/backend/internal/domain"
)

func TestFormatDefectCode(t *testing.T) {
	got := domain.FormatDefectCode("10-01", "01")
	if got != "10-01-01" {
		t.Fatalf("got %q, want 10-01-01", got)
	}
	if domain.FormatDefectCode("", "01") != "" {
		t.Fatal("empty part must yield empty code")
	}
}

func TestValidateDefectCatalogueFields(t *testing.T) {
	if err := domain.ValidateDefectCatalogueFields("10", "Body", "Body"); err != nil {
		t.Fatalf("valid fields: %v", err)
	}
	if err := domain.ValidateDefectCatalogueFields("", "Body", "Body"); err == nil {
		t.Fatal("empty code must fail")
	}
}

func TestSameCatalogueName(t *testing.T) {
	same := [][2]string{
		{"Test Kapı Kolu", "test kapı kolu "},
		{"KAPI KOLU", "kapı kolu"},
		{"Kapı  kolu", " Kapı kolu"},
		{"İç trim", "iç trim"},
		{"DOOR HINGE", "door hinge"},
	}
	for _, p := range same {
		if !domain.SameCatalogueName(p[0], p[1]) {
			t.Errorf("%q and %q should match", p[0], p[1])
		}
	}
	if domain.SameCatalogueName("Kapı kolu", "Kapı paneli") {
		t.Error("different names must not match")
	}
}

func TestValidatePartAndTypeCode(t *testing.T) {
	if err := domain.ValidatePartCode("10", "10-01"); err != nil {
		t.Errorf("10-01: %v", err)
	}
	for _, c := range []string{"40-77", "ZZZ", "10-1", "10-00", "1001", "100-01"} {
		if err := domain.ValidatePartCode("10", c); err == nil {
			t.Errorf("%q should be rejected for zone 10", c)
		}
	}
	if err := domain.ValidateTypeCode("09"); err != nil {
		t.Errorf("09: %v", err)
	}
	for _, c := range []string{"9", "090", "0A", "00", ""} {
		if err := domain.ValidateTypeCode(c); err == nil {
			t.Errorf("type %q should be rejected", c)
		}
	}
}
