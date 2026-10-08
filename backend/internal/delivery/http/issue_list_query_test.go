package http

import (
	"net/http/httptest"
	"testing"
	"time"
)

func TestParseIssueListQuery_OpenedRange(t *testing.T) {
	utc := func(s string) time.Time {
		v, err := time.Parse(time.RFC3339, s)
		if err != nil {
			t.Fatal(err)
		}
		return v
	}
	cases := []struct {
		query     string
		from, to  *time.Time
		wantError error
	}{
		{query: "", from: nil, to: nil},
		{query: "opened_from=2031-03-15", from: ptr(utc("2031-03-14T21:00:00Z"))},
		{query: "opened_to=2031-03-16", to: ptr(utc("2031-03-16T21:00:00Z"))},
		{query: "opened_from=2031-03-15&opened_to=2031-03-15",
			from: ptr(utc("2031-03-14T21:00:00Z")), to: ptr(utc("2031-03-15T21:00:00Z"))},
		{query: "opened_from=2031-03-16&opened_to=2031-03-15", wantError: errOpenedRangeReversed},
		{query: "opened_from=15.03.2031", wantError: errInvalidOpenedDate},
		{query: "opened_to=2031-03-15T00:00:00Z", wantError: errInvalidOpenedDate},
	}
	for _, c := range cases {
		q, err := parseIssueListQuery(httptest.NewRequest("GET", "/issues?"+c.query, nil))
		if c.wantError != nil {
			if err != c.wantError {
				t.Errorf("%q: err = %v, want %v", c.query, err, c.wantError)
			}
			continue
		}
		if err != nil {
			t.Errorf("%q: %v", c.query, err)
			continue
		}
		if !sameInstant(q.OpenedFrom, c.from) || !sameInstant(q.OpenedUntil, c.to) {
			t.Errorf("%q: got [%v, %v), want [%v, %v)", c.query, q.OpenedFrom, q.OpenedUntil, c.from, c.to)
		}
	}
}

func ptr(t time.Time) *time.Time { return &t }

func sameInstant(a, b *time.Time) bool {
	if a == nil || b == nil {
		return a == nil && b == nil
	}
	return a.Equal(*b)
}
