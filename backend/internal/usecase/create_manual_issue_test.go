package usecase_test

import (
	"context"
	"errors"
	"testing"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/usecase"
)

func TestCreateManualIssue_RequiresEachField(t *testing.T) {
	station := 1
	typeID := 2
	base := usecase.CreateIssueInput{
		VIN:         "1KTSKRC2XSB010042",
		SourceType:  domain.IssueSourceManual,
		StationID:   &station,
		IssueTypeID: &typeID,
		Severity:    domain.IssueSeverityMedium,
		Description: "scratch on door",
		ReporterID:  1,
	}

	cases := []struct {
		name    string
		mutate  func(*usecase.CreateIssueInput)
		wantErr error
	}{
		{
			name: "missing vin",
			mutate: func(in *usecase.CreateIssueInput) {
				in.VIN = "  "
			},
			wantErr: domain.ErrVINRequired,
		},
		{
			name: "missing station",
			mutate: func(in *usecase.CreateIssueInput) {
				in.StationID = nil
			},
			wantErr: domain.ErrStationRequired,
		},
		{
			name: "missing issue type",
			mutate: func(in *usecase.CreateIssueInput) {
				in.IssueTypeID = nil
			},
			wantErr: domain.ErrIssueTypeRequired,
		},
		{
			name: "missing severity",
			mutate: func(in *usecase.CreateIssueInput) {
				in.Severity = ""
			},
			wantErr: domain.ErrSeverityRequired,
		},
		{
			name: "missing description",
			mutate: func(in *usecase.CreateIssueInput) {
				in.Description = ""
			},
			wantErr: domain.ErrIssueDescriptionRequired,
		},
		{
			name: "source step not allowed",
			mutate: func(in *usecase.CreateIssueInput) {
				step := 9
				in.SourceStationStepID = &step
			},
			wantErr: domain.ErrInvalidManualSource,
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			in := base
			c.mutate(&in)
			mgr := usecase.NewIssueManager(newCreateIssueFakeRepo(), newNopAudit(), newNopUOW())
			_, err := mgr.Create(context.Background(), in)
			if !errors.Is(err, c.wantErr) {
				t.Fatalf("got %v, want %v", err, c.wantErr)
			}
		})
	}
}

func TestCreateManualIssue_Succeeds(t *testing.T) {
	station := 3
	typeID := 1
	repo := newCreateIssueFakeRepo()
	mgr := usecase.NewIssueManager(repo, newNopAudit(), newNopUOW())
	issue, err := mgr.Create(context.Background(), usecase.CreateIssueInput{
		VIN:         "1KTSKRC2XSB010042",
		SourceType:  domain.IssueSourceManual,
		StationID:   &station,
		IssueTypeID: &typeID,
		Severity:    domain.IssueSeverityCritical,
		Description: "paint chip",
		ReporterID:  7,
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if issue.SourceType != domain.IssueSourceManual {
		t.Fatalf("source = %s", issue.SourceType)
	}
	if issue.SourceStationStepID != nil || issue.SourceCheckItemID != nil {
		t.Fatalf("source ids must be nil")
	}
	if issue.Status != domain.IssueStatusOpen {
		t.Fatalf("status = %s", issue.Status)
	}
}

// Minimal fakes local to this file so we do not depend on unexported test
// helpers from fakes_test.go (same package _test).
type createIssueFakeRepo struct {
	next int64
	byID map[int64]*domain.Issue
}

func newCreateIssueFakeRepo() *createIssueFakeRepo {
	return &createIssueFakeRepo{next: 1, byID: map[int64]*domain.Issue{}}
}

func (f *createIssueFakeRepo) Create(_ context.Context, issue *domain.Issue) (int64, error) {
	id := f.next
	f.next++
	cp := *issue
	cp.ID = id
	f.byID[id] = &cp
	return id, nil
}
func (f *createIssueFakeRepo) GetByID(_ context.Context, id int64) (*domain.Issue, error) {
	if i, ok := f.byID[id]; ok {
		return i, nil
	}
	return nil, domain.ErrNotFound
}
func (f *createIssueFakeRepo) ListForUser(context.Context, int, *domain.IssueStatus) ([]domain.Issue, error) {
	return nil, nil
}
func (f *createIssueFakeRepo) ListAll(context.Context, *domain.IssueStatus) ([]domain.Issue, error) {
	return nil, nil
}
func (f *createIssueFakeRepo) ListByVIN(context.Context, string, *domain.IssueStatus) ([]domain.Issue, error) {
	return nil, nil
}
func (f *createIssueFakeRepo) ListOpenByVIN(context.Context, string) ([]domain.Issue, error) {
	return nil, nil
}
func (f *createIssueFakeRepo) UpdateStatus(context.Context, int64, domain.IssueStatus, int, string) error {
	return nil
}
func (f *createIssueFakeRepo) ListIssueTypes(context.Context) ([]domain.IssueType, error) {
	return nil, nil
}

type nopAudit struct{}

func newNopAudit() *nopAudit { return &nopAudit{} }
func (nopAudit) Append(context.Context, domain.AuditLog) error { return nil }

type nopUOW struct{}

func newNopUOW() *nopUOW { return &nopUOW{} }
func (nopUOW) WithinTx(ctx context.Context, fn func(context.Context) error) error {
	return fn(ctx)
}
