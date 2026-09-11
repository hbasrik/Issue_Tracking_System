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
