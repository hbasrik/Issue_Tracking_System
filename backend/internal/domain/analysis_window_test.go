package domain

import (
	"testing"
	"time"
)

func TestIntersectWindow_ClipsToFilter(t *testing.T) {
	winFrom := time.Date(2026, 8, 20, 0, 0, 0, 0, time.UTC)
	winUntil := time.Date(2026, 8, 27, 0, 0, 0, 0, time.UTC)
	from := time.Date(2026, 8, 24, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 8, 24, 0, 0, 0, 0, time.UTC)

	gotFrom, gotUntil, empty := IntersectWindow(&from, &to, winFrom, winUntil)
	if empty {
		t.Fatal("expected a non-empty intersection")
	}
	if !gotFrom.Equal(StartOfUTCDay(from)) {
		t.Fatalf("from = %v", gotFrom)
	}
	if !gotUntil.Equal(StartOfUTCDay(to).Add(24 * time.Hour)) {
		t.Fatalf("until = %v", gotUntil)
	}
}

func TestIntersectWindow_EmptyWhenDisjoint(t *testing.T) {
	winFrom := time.Date(2026, 8, 25, 0, 0, 0, 0, time.UTC)
	winUntil := time.Date(2026, 8, 26, 0, 0, 0, 0, time.UTC)
	from := time.Date(2026, 8, 24, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 8, 24, 0, 0, 0, 0, time.UTC)

	_, _, empty := IntersectWindow(&from, &to, winFrom, winUntil)
	if !empty {
		t.Fatal("expected empty intersection")
	}
}
