package postgres

import (
	"testing"

	"github.com/karea/backend/internal/domain"
)

func TestParseClassificationMetadata_ManualCorrection(t *testing.T) {
	raw := []byte(`{"fields": {"defect_code": {"to": "10-01-04", "from": ""},
		"defect_part_id": {"to": 10, "from": null},
		"defect_type_id": {"to": 1, "from": 7},
		"responsible_process_id": {"to": 1, "from": null},
		"custom_part_name": {"to": "", "from": "test parcasi"}}, "issue_id": 41}`)
	got := parseClassificationMetadata(raw)
	wantFields := []string{
		domain.ClassificationFieldPart,
		domain.ClassificationFieldType,
		domain.ClassificationFieldCustomPart,
		domain.ClassificationFieldCode,
	}
	if len(got) != len(wantFields) {
		t.Fatalf("got %d changes, want %d (process must be skipped): %+v", len(got), len(wantFields), got)
	}
	for i, f := range wantFields {
		if got[i].field != f {
			t.Errorf("change %d: field %q, want %q", i, got[i].field, f)
		}
	}
	if got[0].from.id != nil || got[0].to.id == nil || *got[0].to.id != 10 {
		t.Errorf("part: want null → 10, got %+v", got[0])
	}
	if got[1].from.id == nil || *got[1].from.id != 7 || *got[1].to.id != 1 {
		t.Errorf("type: want 7 → 1, got %+v", got[1])
	}
	if got[2].from.text != "test parcasi" || got[2].to.text != "" {
		t.Errorf("custom part: got %+v", got[2])
	}
	if got[3].from.text != "" || got[3].to.text != "10-01-04" {
		t.Errorf("code: got %+v", got[3])
	}
}

func TestParseClassificationMetadata_PromoteOther(t *testing.T) {
	part := parseClassificationMetadata([]byte(`{"action": "promote_other_part", "issue_id": 42, "custom_name": "Kapı kolu", "new_part_id": 50}`))
	if len(part) != 1 || part[0].field != domain.ClassificationFieldPart || part[0].from.text != "Kapı kolu" || part[0].to.id == nil || *part[0].to.id != 50 {
		t.Errorf("promote part: got %+v", part)
	}
	typ := parseClassificationMetadata([]byte(`{"action": "promote_other_type", "issue_id": 42, "custom_name": "Pas", "new_type_id": 12}`))
	if len(typ) != 1 || typ[0].field != domain.ClassificationFieldType || typ[0].from.text != "Pas" || *typ[0].to.id != 12 {
		t.Errorf("promote type: got %+v", typ)
	}
}

func TestParseClassificationMetadata_NoChange(t *testing.T) {
	for _, raw := range []string{`{"fields": {}, "issue_id": 38}`, ``, `not json`} {
		if got := parseClassificationMetadata([]byte(raw)); len(got) != 0 {
			t.Errorf("%q: want no changes, got %+v", raw, got)
		}
	}
}

func TestRefName(t *testing.T) {
	id := 3
	names := map[int]catalogueName{3: {tr: "Kapı", en: "Door"}}
	if tr, en := refName(classificationRef{id: &id}, names); tr != "Kapı" || en != "Door" {
		t.Errorf("id ref: %q %q", tr, en)
	}
	if tr, en := refName(classificationRef{text: "serbest"}, names); tr != "serbest" || en != "serbest" {
		t.Errorf("text ref: %q %q", tr, en)
	}
	if tr, en := refName(classificationRef{}, names); tr != "" || en != "" {
		t.Errorf("empty ref: %q %q", tr, en)
	}
}
