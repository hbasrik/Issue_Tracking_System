package http

import (
	"testing"

	"github.com/karea/backend/internal/domain"
)

// TestParseChecklistType guards the URL contract for the checklist routes. The
// {type} segment is what makes POST /vehicles/{vin}/checklist/test/{itemId}
// reachable, since Karar 4's Test checklist reuses the same generic route as
// EoL and Shipment rather than getting one of its own.
func TestParseChecklistType(t *testing.T) {
	cases := []struct {
		raw    string
		want   domain.ChecklistType
		wantOK bool
	}{
		{"eol", domain.ChecklistTypeEOL, true},
		{"shipment", domain.ChecklistTypeShipment, true},
		{"test", domain.ChecklistTypeTest, true},
		{"TEST", domain.ChecklistTypeTest, true},
		{"tests", "", false},
		{"", "", false},
	}

	for _, c := range cases {
		t.Run(c.raw, func(t *testing.T) {
			got, ok := parseChecklistType(c.raw)
			if ok != c.wantOK {
				t.Fatalf("ok = %v, want %v", ok, c.wantOK)
			}
			if got != c.want {
				t.Errorf("type = %q, want %q", got, c.want)
			}
		})
	}
}
