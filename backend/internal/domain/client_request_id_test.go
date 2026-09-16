package domain_test

import (
	"errors"
	"testing"

	"github.com/karea/backend/internal/domain"
)

func TestNormalizeClientRequestID(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name    string
		raw     string
		want    string
		wantErr error
	}{
		{name: "empty", raw: "  ", want: ""},
		{
			name: "uuid",
			raw:  "  550E8400-E29B-41D4-A716-446655440000  ",
			want: "550e8400-e29b-41d4-a716-446655440000",
		},
		{
			name:    "not uuid",
			raw:     "retry-1",
			wantErr: domain.ErrClientRequestIDInvalid,
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got, err := domain.NormalizeClientRequestID(c.raw)
			if c.wantErr != nil {
				if !errors.Is(err, c.wantErr) {
					t.Fatalf("err = %v, want %v", err, c.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatalf("err = %v", err)
			}
			if got != c.want {
				t.Fatalf("got %q, want %q", got, c.want)
			}
		})
	}
}
