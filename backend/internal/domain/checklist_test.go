package domain

import (
	"strings"
	"testing"
)

func TestValidateTemplateItemFields(t *testing.T) {
	branch := EOLItemPhaseBranch
	depot := EOLItemPhaseDepot

	cases := []struct {
		name  string
		typ   ChecklistType
		text  string
		phase *EOLItemPhase
		want  error
	}{
		{name: "eol branch", typ: ChecklistTypeEOL, text: "Paint", phase: &branch},
		{name: "eol depot", typ: ChecklistTypeEOL, text: "Charge", phase: &depot},
		{name: "eol missing phase", typ: ChecklistTypeEOL, text: "Paint", want: ErrEOLPhaseRequired},
		{name: "shipment no phase", typ: ChecklistTypeShipment, text: "VIN match"},
		{name: "shipment with phase", typ: ChecklistTypeShipment, text: "VIN match", phase: &branch, want: ErrEOLPhaseNotAllowed},
		{name: "test no phase", typ: ChecklistTypeTest, text: "Dyno"},
		{name: "empty text", typ: ChecklistTypeTest, text: "  ", want: ErrTemplateItemTextRequired},
		{name: "too long", typ: ChecklistTypeTest, text: strings.Repeat("a", MaxTemplateItemTextLen+1), want: ErrTemplateItemTextTooLong},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := ValidateTemplateItemFields(tc.typ, tc.text, tc.phase)
			if tc.want == nil {
				if err != nil {
					t.Fatalf("err = %v, want nil", err)
				}
				return
			}
			if err != tc.want {
				t.Fatalf("err = %v, want %v", err, tc.want)
			}
		})
	}
}

func TestTemplateItemInUseError(t *testing.T) {
	err := &TemplateItemInUseError{VehicleCount: 4}
	want := "bu madde 4 araçta kullanılmış, silinemez — pasife çekebilirsiniz"
	if err.Error() != want {
		t.Fatalf("error = %q, want %q", err.Error(), want)
	}
}
