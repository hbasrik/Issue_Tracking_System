package postgres

import (
	"context"
	"slices"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/karea/backend/internal/domain"
)

// openedRangeFixtures inserts marked issues around plant-day boundaries in
// March 2031 (no seed issue is that late) by copying a seeded open issue.
// Rolled back with the test transaction.
func openedRangeFixtures(ctx context.Context, t *testing.T, tx pgx.Tx) map[string]int64 {
	t.Helper()
	at := map[string]string{
		"before_start":   "2031-03-14T20:59:59.999Z",    // 14 Mar 23:59:59.999 local
		"start_first":    "2031-03-14T21:00:00Z",        // 15 Mar 00:00 local
		"start_utc_14":   "2031-03-14T22:30:00Z",        // 15 Mar 01:30 local, UTC day 14
		"local_16_utc15": "2031-03-15T22:30:00Z",        // 16 Mar 01:30 local, UTC day 15
		"end_last":       "2031-03-16T20:59:59.999999Z", // 16 Mar 23:59:59.999999 local
		"after_end":      "2031-03-16T21:00:00Z",        // 17 Mar 00:00 local
	}
	ids := map[string]int64{}
	for name, ts := range at {
		var id int64
		if err := tx.QueryRow(ctx, `
			INSERT INTO issue_list (vin, source_type, source_station_step_id, source_check_item_id,
			                        station_id, issue_type_id, severity, description,
			                        status, issue_reporter_id, defect_part_id, defect_type_id,
			                        responsible_process_id, custom_part_name, custom_defect_name, defect_code,
			                        issue_date)
			SELECT vin, source_type, source_station_step_id, source_check_item_id,
			       station_id, issue_type_id, severity, 'tmp-opened-range ' || $1::text,
			       'OPEN', issue_reporter_id, defect_part_id, defect_type_id,
			       responsible_process_id, custom_part_name, custom_defect_name, defect_code,
			       $2::timestamptz
			FROM issue_list WHERE status = 'OPEN'
			ORDER BY id LIMIT 1
			RETURNING id`, name, ts).Scan(&id); err != nil {
			t.Fatalf("insert %s: %v", name, err)
		}
		ids[name] = id
	}
	return ids
}

func dayStart(t *testing.T, day string) *time.Time {
	t.Helper()
	v, err := domain.PlantDayStart(day)
	if err != nil {
		t.Fatal(err)
	}
	return &v
}

func dayEnd(t *testing.T, day string) *time.Time {
	t.Helper()
	v, err := domain.PlantDayEnd(day)
	if err != nil {
		t.Fatal(err)
	}
	return &v
}

func TestListIssues_OpenedRangeCutsPlantDays(t *testing.T) {
	ctx, tx := stageTestTx(t)
	ids := openedRangeFixtures(ctx, t, tx)
	repo := NewIssueRepo(nil)

	fixtureNames := func(items []domain.Issue) []string {
		var out []string
		for _, it := range items {
			for name, id := range ids {
				if it.ID == id {
					out = append(out, name)
				}
			}
		}
		slices.Sort(out)
		return out
	}
	sorted := func(s ...string) []string { slices.Sort(s); return s }

	cases := []struct {
		label string
		q     domain.IssueListQuery
		want  []string
	}{
		{"both bounds 15–16 Mar", domain.IssueListQuery{OpenedFrom: dayStart(t, "2031-03-15"), OpenedUntil: dayEnd(t, "2031-03-16")},
			sorted("start_first", "start_utc_14", "local_16_utc15", "end_last")},
		{"one day 15 Mar", domain.IssueListQuery{OpenedFrom: dayStart(t, "2031-03-15"), OpenedUntil: dayEnd(t, "2031-03-15")},
			sorted("start_first", "start_utc_14")},
		{"start only 15 Mar", domain.IssueListQuery{OpenedFrom: dayStart(t, "2031-03-15")},
			sorted("start_first", "start_utc_14", "local_16_utc15", "end_last", "after_end")},
		{"end only 15 Mar", domain.IssueListQuery{OpenedUntil: dayEnd(t, "2031-03-15")},
			sorted("before_start", "start_first", "start_utc_14")},
	}
	for _, c := range cases {
		page, err := repo.ListAll(ctx, c.q)
		if err != nil {
			t.Fatalf("%s: %v", c.label, err)
		}
		got := fixtureNames(page.Items)
		if !slices.Equal(got, c.want) {
			t.Errorf("%s: fixtures %v, want %v", c.label, got, c.want)
		}
		if c.q.OpenedFrom != nil {
			for _, it := range page.Items {
				if it.IssueDate.Before(*c.q.OpenedFrom) {
					t.Errorf("%s: issue %d opened %s before the range", c.label, it.ID, it.IssueDate)
				}
			}
		}
		if c.q.OpenedUntil != nil {
			for _, it := range page.Items {
				if !it.IssueDate.Before(*c.q.OpenedUntil) {
					t.Errorf("%s: issue %d opened %s after the range", c.label, it.ID, it.IssueDate)
				}
			}
		}
	}
}

func TestListIssues_OpenedRangeKeepsKeysetPaging(t *testing.T) {
	ctx, tx := stageTestTx(t)
	ids := openedRangeFixtures(ctx, t, tx)
	repo := NewIssueRepo(nil)
	q := domain.IssueListQuery{OpenedFrom: dayStart(t, "2031-03-15"), OpenedUntil: dayEnd(t, "2031-03-16"), Limit: 3}

	var seen []int64
	for range 5 {
		page, err := repo.ListAll(ctx, q)
		if err != nil {
			t.Fatal(err)
		}
		for _, it := range page.Items {
			seen = append(seen, it.ID)
		}
		if !page.HasMore {
			break
		}
		q.BeforeDate, q.BeforeID = page.NextBeforeDate, page.NextBeforeID
	}
	want := []int64{ids["end_last"], ids["local_16_utc15"], ids["start_utc_14"], ids["start_first"]}
	if !slices.Equal(seen, want) {
		t.Fatalf("paged ids %v, want %v (newest first, range kept across pages)", seen, want)
	}
}
