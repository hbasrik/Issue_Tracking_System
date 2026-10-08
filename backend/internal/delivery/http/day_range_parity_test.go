package http

import (
	"net/http/httptest"
	"testing"
	"time"

	"github.com/karea/backend/internal/domain"
)

// The issue board (opened_from / opened_to) and Analysis (from / to) must
// turn the same days into the same instants (Karar 31).
func TestDayRangeParity_BoardAndAnalysisParseTheSameInstants(t *testing.T) {
	ranges := []struct{ from, to string }{
		{"2031-03-15", "2031-03-16"},
		{"2031-03-15", "2031-03-15"},
		{"2031-03-15", ""},
		{"", "2031-03-16"},
		{"2026-10-01", "2026-10-31"},
	}
	for _, r := range ranges {
		board, analysis := "", ""
		if r.from != "" {
			board += "&opened_from=" + r.from
			analysis += "&from=" + r.from
		}
		if r.to != "" {
			board += "&opened_to=" + r.to
			analysis += "&to=" + r.to
		}
		q, err := parseIssueListQuery(httptest.NewRequest("GET", "/issues?"+board, nil))
		if err != nil {
			t.Fatalf("%v: board: %v", r, err)
		}
		f, err := parseAnalysisFilter(httptest.NewRequest("GET", "/analysis/dashboard?"+analysis, nil))
		if err != nil {
			t.Fatalf("%v: analysis: %v", r, err)
		}
		from, until := domain.InclusiveDateBounds(f.From, f.To)
		if !sameInstant(q.OpenedFrom, from) || !sameInstant(q.OpenedUntil, until) {
			t.Errorf("%v: board [%v, %v) analysis [%v, %v)", r, q.OpenedFrom, q.OpenedUntil, from, until)
		}
	}
}

// An RFC3339 instant names the plant day it falls on: 15 Mar 01:30 local is
// 14 Mar in UTC but the day is 15 Mar.
func TestParseAnalysisFilter_InstantNamesPlantDay(t *testing.T) {
	f, err := parseAnalysisFilter(httptest.NewRequest("GET",
		"/analysis/dashboard?from=2031-03-14T22:30:00Z&to=2031-03-16T20:59:59Z", nil))
	if err != nil {
		t.Fatal(err)
	}
	from, until := domain.InclusiveDateBounds(f.From, f.To)
	if want := time.Date(2031, 3, 14, 21, 0, 0, 0, time.UTC); !from.Equal(want) {
		t.Errorf("from = %v, want %v", from, want)
	}
	if want := time.Date(2031, 3, 16, 21, 0, 0, 0, time.UTC); !until.Equal(want) {
		t.Errorf("until = %v, want %v", until, want)
	}
}
