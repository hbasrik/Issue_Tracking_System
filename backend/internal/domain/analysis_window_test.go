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
	// 24 Aug is a plant day: 23 Aug 21:00 UTC to 24 Aug 21:00 UTC.
	if want := time.Date(2026, 8, 23, 21, 0, 0, 0, time.UTC); !gotFrom.Equal(want) {
		t.Fatalf("from = %v, want %v", gotFrom, want)
	}
	if want := time.Date(2026, 8, 24, 21, 0, 0, 0, time.UTC); !gotUntil.Equal(want) {
		t.Fatalf("until = %v, want %v", gotUntil, want)
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
