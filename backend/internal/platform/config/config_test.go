package config

import (
	"reflect"
	"testing"
)

func TestParseCSVOrigins(t *testing.T) {
	got := parseCSVOrigins("http://localhost:5173, http://localhost:5174, ,https://app.example")
	want := []string{
		"http://localhost:5173",
		"http://localhost:5174",
		"https://app.example",
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %#v, want %#v", got, want)
	}
}

func TestParseCSVOrigins_Empty(t *testing.T) {
	if got := parseCSVOrigins("  , ,"); len(got) != 0 {
		t.Fatalf("got %#v, want empty", got)
	}
}
