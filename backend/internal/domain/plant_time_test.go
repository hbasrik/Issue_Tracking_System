package domain

import (
	"testing"
	"time"
)

func TestPlantDayBoundsAreIstanbulMidnights(t *testing.T) {
	start, err := PlantDayStart("2031-03-15")
	if err != nil {
		t.Fatal(err)
	}
	end, err := PlantDayEnd("2031-03-15")
	if err != nil {
		t.Fatal(err)
	}
	wantStart := time.Date(2031, 3, 14, 21, 0, 0, 0, time.UTC)
	wantEnd := time.Date(2031, 3, 15, 21, 0, 0, 0, time.UTC)
	if !start.Equal(wantStart) || !end.Equal(wantEnd) {
		t.Fatalf("2031-03-15 in %s = [%s, %s), want [%s, %s)", PlantTimeZone,
			start.UTC().Format(time.RFC3339), end.UTC().Format(time.RFC3339),
			wantStart.Format(time.RFC3339), wantEnd.Format(time.RFC3339))
	}
}

func TestPlantDayStartRejectsNonCalendarDays(t *testing.T) {
	for _, raw := range []string{"", "2031-3-15", "15.03.2031", "2031-02-30", "2031-03-15T00:00:00Z"} {
		if _, err := PlantDayStart(raw); err == nil {
			t.Errorf("PlantDayStart(%q) accepted", raw)
		}
	}
}
