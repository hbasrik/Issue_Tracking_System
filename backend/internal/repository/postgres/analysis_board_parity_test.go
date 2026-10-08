package postgres

import (
	"maps"
	"testing"
	"time"

	"github.com/karea/backend/internal/domain"
)

// The issue board and the Analysis page count the same issues for the same
// plant days (Karar 31): board rows = Cards.OpenedIssues = sum of the
// Sparklines.Opened buckets, and the buckets are the board rows per plant
// day. Fixtures (openedRangeFixtures) sit on local 00:00 / 23:59:59.999 and
// on records whose UTC day differs from the plant day.
func TestAnalysisAndBoardCountTheSamePlantDays(t *testing.T) {
	ctx, tx := stageTestTx(t)
	openedRangeFixtures(ctx, t, tx)
	board := NewIssueRepo(nil)
	analysis := &AnalysisRepo{pool: tx}

	dateOnly := func(day string) *time.Time {
		if day == "" {
			return nil
		}
		d, err := domain.DateOnly(day)
		if err != nil {
			t.Fatal(err)
		}
		return &d
	}
	boundary := func(day string, fn func(string) (time.Time, error)) *time.Time {
		if day == "" {
			return nil
		}
		v, err := fn(day)
		if err != nil {
			t.Fatal(err)
		}
		return &v
	}

	cases := []struct {
		label    string
		from, to string
		days     map[string]int // fixed expectation where only fixtures fall
	}{
		{"15–16 Mar", "2031-03-15", "2031-03-16", map[string]int{"2031-03-15": 2, "2031-03-16": 2}},
		{"15 Mar", "2031-03-15", "2031-03-15", map[string]int{"2031-03-15": 2}},
		{"16 Mar", "2031-03-16", "2031-03-16", map[string]int{"2031-03-16": 2}},
		{"from 15 Mar", "2031-03-15", "", map[string]int{"2031-03-15": 2, "2031-03-16": 2, "2031-03-17": 1}},
		{"to 16 Mar (with seed issues)", "", "2031-03-16", nil},
	}
	for _, c := range cases {
		page, err := board.ListAll(ctx, domain.IssueListQuery{
			OpenedFrom:  boundary(c.from, domain.PlantDayStart),
			OpenedUntil: boundary(c.to, domain.PlantDayEnd),
		})
		if err != nil {
			t.Fatalf("%s: board: %v", c.label, err)
		}
		boardDays := map[string]int{}
		for _, it := range page.Items {
			boardDays[domain.PlantCalendarDay(it.IssueDate)]++
		}

		dash, err := analysis.Dashboard(ctx, domain.AnalysisFilter{From: dateOnly(c.from), To: dateOnly(c.to)})
		if err != nil {
			t.Fatalf("%s: analysis: %v", c.label, err)
		}
		buckets, sum := map[string]int{}, 0
		for _, d := range dash.Sparklines.Opened {
			buckets[domain.DateOnlyDay(d.Day)] += int(d.CompletedCount)
			sum += int(d.CompletedCount)
		}

		if int64(len(page.Items)) != dash.Cards.OpenedIssues || sum != len(page.Items) {
			t.Errorf("%s: board %d, analysis OpenedIssues %d, daily sum %d", c.label,
				len(page.Items), dash.Cards.OpenedIssues, sum)
		}
		if !maps.Equal(buckets, boardDays) {
			t.Errorf("%s: analysis days %v, board days %v", c.label, buckets, boardDays)
		}
		if c.days != nil && !maps.Equal(boardDays, c.days) {
			t.Errorf("%s: days %v, want %v", c.label, boardDays, c.days)
		}
	}
}
