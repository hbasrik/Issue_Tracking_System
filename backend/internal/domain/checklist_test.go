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
	want := "bu madde 4 araçta değerlendirilmiş veya issue'ya bağlı, silinemez — pasife çekebilirsiniz"
	if err.Error() != want {
		t.Fatalf("error = %q, want %q", err.Error(), want)
	}
}

func TestUserInUseError(t *testing.T) {
	err := &UserInUseError{ReferenceCount: 9}
	want := "bu kullanıcı 9 kayıtta kullanılmış, silinemez — pasife çekebilirsiniz"
	if err.Error() != want {
		t.Fatalf("error = %q, want %q", err.Error(), want)
	}
	empty := &UserInUseError{}
	if empty.Error() != "bu kullanıcı kayıtlarda kullanılmış, silinemez — pasife çekebilirsiniz" {
		t.Fatalf("empty = %q", empty.Error())
	}
}

func TestPreferredActiveTemplateID(t *testing.T) {
	model5 := 5
	model9 := 9
	generic := ChecklistTemplate{ID: 1, Type: ChecklistTypeTest, Name: "generic", IsActive: true}
	specific5 := ChecklistTemplate{ID: 10, VehicleModelID: &model5, Type: ChecklistTypeTest, Name: "m5", IsActive: true}
	specific9 := ChecklistTemplate{ID: 11, VehicleModelID: &model9, Type: ChecklistTypeTest, Name: "m9", IsActive: true}
	inactive := ChecklistTemplate{ID: 12, VehicleModelID: &model5, Type: ChecklistTypeTest, Name: "off", IsActive: false}

	t.Run("prefers model-specific", func(t *testing.T) {
		id, err := PreferredActiveTemplateID([]ChecklistTemplate{generic, specific5, specific9}, &model5)
		if err != nil || id != 10 {
			t.Fatalf("id=%d err=%v, want 10", id, err)
		}
	})
	t.Run("falls back to generic", func(t *testing.T) {
		id, err := PreferredActiveTemplateID([]ChecklistTemplate{generic, specific9}, &model5)
		if err != nil || id != 1 {
			t.Fatalf("id=%d err=%v, want 1", id, err)
		}
	})
	t.Run("nil model uses generic", func(t *testing.T) {
		id, err := PreferredActiveTemplateID([]ChecklistTemplate{generic, specific5}, nil)
		if err != nil || id != 1 {
			t.Fatalf("id=%d err=%v, want 1", id, err)
		}
	})
	t.Run("ignores inactive specific", func(t *testing.T) {
		id, err := PreferredActiveTemplateID([]ChecklistTemplate{generic, inactive}, &model5)
		if err != nil || id != 1 {
			t.Fatalf("id=%d err=%v, want 1", id, err)
		}
	})
	t.Run("not found", func(t *testing.T) {
		_, err := PreferredActiveTemplateID(nil, &model5)
		if err != ErrNotFound {
			t.Fatalf("err=%v, want ErrNotFound", err)
		}
	})
}
