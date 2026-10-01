package http

import (
	"encoding/json"
	"testing"
)

func TestUpdateClassificationRequest_ProcessPresence(t *testing.T) {
	cases := []struct {
		body    string
		wantSet bool
		wantNil bool
		wantVal int
	}{
		{`{"defect_part_id":1,"defect_type_id":2}`, false, true, 0},
		{`{"defect_part_id":1,"defect_type_id":2,"responsible_process_id":null}`, true, true, 0},
		{`{"defect_part_id":1,"defect_type_id":2,"responsible_process_id":3}`, true, false, 3},
	}
	for _, tc := range cases {
		var req updateClassificationRequest
		if err := json.Unmarshal([]byte(tc.body), &req); err != nil {
			t.Fatalf("%s: %v", tc.body, err)
		}
		got := req.ResponsibleProcessID
		if got.Set != tc.wantSet || (got.Value == nil) != tc.wantNil || (got.Value != nil && *got.Value != tc.wantVal) {
			t.Fatalf("%s: got set=%v value=%v", tc.body, got.Set, got.Value)
		}
	}
}
