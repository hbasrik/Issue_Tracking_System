package domain

import (
	"fmt"
	"time"
	_ "time/tzdata" // the zone must resolve on hosts without /usr/share/zoneinfo
)

// PlantTimeZone is the plant's wall clock. Calendar-day filters ("today",
// "opened between 1 and 7 October") cut days here, not in UTC: issue_date is
// stored as timestamptz and a UTC cut would move 00:00–03:00 local records
// to the previous day.
const PlantTimeZone = istanbulTZ

// PlantLocation returns the plant time zone. tzdata is embedded, so an error
// means a broken build, not a missing host file.
func PlantLocation() (*time.Location, error) {
	loc, err := time.LoadLocation(PlantTimeZone)
	if err != nil {
		return nil, fmt.Errorf("load %s: %w", PlantTimeZone, err)
	}
	return loc, nil
}

// PlantDayStart parses a YYYY-MM-DD calendar day and returns its local
// midnight in the plant time zone.
func PlantDayStart(day string) (time.Time, error) {
	loc, err := PlantLocation()
	if err != nil {
		return time.Time{}, err
	}
	return time.ParseInLocation("2006-01-02", day, loc)
}

// PlantDayEnd returns the exclusive end of a YYYY-MM-DD plant calendar day
// (next local midnight; 23 or 25 hours later across a DST change).
func PlantDayEnd(day string) (time.Time, error) {
	start, err := PlantDayStart(day)
	if err != nil {
		return time.Time{}, err
	}
	return start.AddDate(0, 0, 1), nil
}

// PlantCalendarDay is the plant calendar day (YYYY-MM-DD) an instant falls on.
func PlantCalendarDay(t time.Time) string {
	return t.In(mustPlantLocation()).Format(time.DateOnly)
}

// DateOnlyDay is the YYYY-MM-DD a date-only value carries. Date-only values
// (Analysis from/to, compare windows) are UTC midnight of the chosen day, so
// their UTC date is the day; never use it for a real instant.
func DateOnlyDay(d time.Time) string {
	return d.UTC().Format(time.DateOnly)
}

// DateOnly is the date-only value of a YYYY-MM-DD plant day (UTC midnight).
func DateOnly(day string) (time.Time, error) {
	return time.Parse(time.DateOnly, day)
}

// PlantDayBounds maps a date-only value to its plant day [start, end).
func PlantDayBounds(d time.Time) (start, end time.Time) {
	day := DateOnlyDay(d)
	start, err := PlantDayStart(day)
	if err != nil {
		panic(err) // only a missing zone fails here; tzdata is embedded
	}
	end, _ = PlantDayEnd(day)
	return start, end
}

func mustPlantLocation() *time.Location {
	loc, err := PlantLocation()
	if err != nil {
		panic(err) // tzdata is embedded; this is a broken build
	}
	return loc
}
