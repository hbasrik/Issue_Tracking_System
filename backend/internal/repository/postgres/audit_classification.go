package postgres

import (
	"context"
	"encoding/json"
	"strconv"
	"strings"

	"github.com/karea/backend/internal/domain"
)

// classificationRef is one side of a parsed change: a catalogue id to resolve,
// or free text used verbatim.
type classificationRef struct {
	id   *int
	text string
}

type parsedClassificationChange struct {
	field    string
	from, to classificationRef
}

type classificationMetadata struct {
	Fields map[string]struct {
		From json.RawMessage `json:"from"`
		To   json.RawMessage `json:"to"`
	} `json:"fields"`
	Action     string `json:"action"`
	CustomName string `json:"custom_name"`
	NewPartID  *int   `json:"new_part_id"`
	NewTypeID  *int   `json:"new_type_id"`
}

// parseClassificationMetadata turns ISSUE_CLASSIFICATION_CHANGE metadata into
// ordered field changes. It understands both writers: the per-field diff of a
// manual correction and the "promote Other" catalogue action. The responsible
// process is skipped on purpose (hidden in the UI, docs/16 A33).
func parseClassificationMetadata(raw []byte) []parsedClassificationChange {
	if len(raw) == 0 {
		return nil
	}
	var m classificationMetadata
	if err := json.Unmarshal(raw, &m); err != nil {
		return nil
	}
	switch m.Action {
	case "promote_other_part":
		return []parsedClassificationChange{{
			field: domain.ClassificationFieldPart,
			from:  classificationRef{text: m.CustomName},
			to:    classificationRef{id: m.NewPartID},
		}}
	case "promote_other_type":
		return []parsedClassificationChange{{
			field: domain.ClassificationFieldType,
			from:  classificationRef{text: m.CustomName},
			to:    classificationRef{id: m.NewTypeID},
		}}
	}
	order := []struct {
		key, field string
		isID       bool
	}{
		{"defect_part_id", domain.ClassificationFieldPart, true},
		{"defect_type_id", domain.ClassificationFieldType, true},
		{"custom_part_name", domain.ClassificationFieldCustomPart, false},
		{"custom_defect_name", domain.ClassificationFieldCustomDefect, false},
		{"defect_code", domain.ClassificationFieldCode, false},
	}
	var out []parsedClassificationChange
	for _, o := range order {
		f, ok := m.Fields[o.key]
		if !ok {
			continue
		}
		out = append(out, parsedClassificationChange{
			field: o.field,
			from:  jsonRef(f.From, o.isID),
			to:    jsonRef(f.To, o.isID),
		})
	}
	return out
}

func jsonRef(raw json.RawMessage, isID bool) classificationRef {
	s := strings.TrimSpace(string(raw))
	if s == "" || s == "null" {
		return classificationRef{}
	}
	if isID {
		n, err := strconv.Atoi(strings.Trim(s, `"`))
		if err != nil {
			return classificationRef{}
		}
		return classificationRef{id: &n}
	}
	var text string
	if err := json.Unmarshal(raw, &text); err != nil {
		return classificationRef{}
	}
	return classificationRef{text: strings.TrimSpace(text)}
}

type catalogueName struct{ tr, en string }

// resolveClassificationChanges resolves part/type ids across every parsed row
// with one query per catalogue table (inactive rows included) and returns the
// display changes in the same order as the input rows.
func resolveClassificationChanges(ctx context.Context, q dbExecutor, rows [][]parsedClassificationChange) ([][]domain.ClassificationChange, error) {
	partIDs, typeIDs := []int{}, []int{}
	for _, row := range rows {
		for _, c := range row {
			for _, ref := range []classificationRef{c.from, c.to} {
				if ref.id == nil {
					continue
				}
				switch c.field {
				case domain.ClassificationFieldPart:
					partIDs = append(partIDs, *ref.id)
				case domain.ClassificationFieldType:
					typeIDs = append(typeIDs, *ref.id)
				}
			}
		}
	}
	parts, err := catalogueNames(ctx, q, "defect_parts", partIDs)
	if err != nil {
		return nil, err
	}
	types, err := catalogueNames(ctx, q, "defect_types", typeIDs)
	if err != nil {
		return nil, err
	}
	out := make([][]domain.ClassificationChange, len(rows))
	for i, row := range rows {
		changes := make([]domain.ClassificationChange, 0, len(row))
		for _, c := range row {
			names := parts
			if c.field == domain.ClassificationFieldType {
				names = types
			}
			fromTR, fromEN := refName(c.from, names)
			toTR, toEN := refName(c.to, names)
			changes = append(changes, domain.ClassificationChange{
				Field: c.field, FromTR: fromTR, FromEN: fromEN, ToTR: toTR, ToEN: toEN,
			})
		}
		out[i] = changes
	}
	return out, nil
}

func refName(ref classificationRef, names map[int]catalogueName) (string, string) {
	if ref.id == nil {
		return ref.text, ref.text
	}
	n := names[*ref.id]
	return n.tr, n.en
}

func catalogueNames(ctx context.Context, q dbExecutor, table string, ids []int) (map[int]catalogueName, error) {
	out := map[int]catalogueName{}
	if len(ids) == 0 {
		return out, nil
	}
	rows, err := q.Query(ctx, `SELECT id, name_tr, name_en FROM `+table+` WHERE id = ANY($1)`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var id int
		var n catalogueName
		if err := rows.Scan(&id, &n.tr, &n.en); err != nil {
			return nil, err
		}
		out[id] = n
	}
	return out, rows.Err()
}
