package http

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/karea/backend/internal/domain"
)

// TestWriteErrorDepotReleaseBlocked pins the wire format of the EOL
// depot-release hard block: 409 with the blocking issues enumerated, so the
// Vehicle Detail EoL tab can list exactly what to close before releasing.
func TestWriteErrorDepotReleaseBlocked(t *testing.T) {
	rec := httptest.NewRecorder()

	writeError(rec, &domain.DepotReleaseBlockedError{
		VIN: "1HGCM82633A004352",
		BlockingIssues: []domain.BlockingIssue{
			{ID: 41, Status: domain.IssueStatusOpen, Severity: domain.IssueSeverityCritical},
			{ID: 57, Status: domain.IssueStatusDone, Severity: domain.IssueSeverityLow},
		},
	})

	if rec.Code != http.StatusConflict {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusConflict)
	}

	var body struct {
		Error          string                 `json:"error"`
		BlockingIssues []domain.BlockingIssue `json:"blocking_issues"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode body: %v", err)
	}

	want := "depot release blocked for 1HGCM82633A004352: 2 open issue(s) remain (issue ids: 41, 57)"
	if body.Error != want {
		t.Errorf("error = %q, want %q", body.Error, want)
	}
	if len(body.BlockingIssues) != 2 {
		t.Fatalf("blocking issues = %d, want 2", len(body.BlockingIssues))
	}
	if body.BlockingIssues[0].ID != 41 || body.BlockingIssues[0].Severity != domain.IssueSeverityCritical {
		t.Errorf("first blocking issue = %+v", body.BlockingIssues[0])
	}
}

func TestWriteErrorDepotChecklistLocked(t *testing.T) {
	rec := httptest.NewRecorder()
	writeError(rec, domain.ErrDepotChecklistLocked)

	if rec.Code != http.StatusConflict {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusConflict)
	}

	var body struct {
		Error string `json:"error"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	if body.Error != domain.ErrDepotChecklistLocked.Error() {
		t.Errorf("error = %q, want %q", body.Error, domain.ErrDepotChecklistLocked.Error())
	}
}

func TestWriteErrorAccountInactive(t *testing.T) {
	rec := httptest.NewRecorder()
	writeError(rec, domain.ErrAccountInactive)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusForbidden)
	}

	var body struct {
		Error string `json:"error"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	if body.Error != domain.ErrAccountInactive.Error() {
		t.Errorf("error = %q, want %q", body.Error, domain.ErrAccountInactive.Error())
	}
}

func TestWriteErrorCannotChangeOwnRole(t *testing.T) {
	rec := httptest.NewRecorder()
	writeError(rec, domain.ErrCannotChangeOwnRole)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusForbidden)
	}

	var body struct {
		Error string `json:"error"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	if body.Error != domain.ErrCannotChangeOwnRole.Error() {
		t.Errorf("error = %q, want %q", body.Error, domain.ErrCannotChangeOwnRole.Error())
	}
}

func TestWriteErrorLastActiveManager(t *testing.T) {
	rec := httptest.NewRecorder()
	writeError(rec, domain.ErrLastActiveManager)

	if rec.Code != http.StatusConflict {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusConflict)
	}

	var body struct {
		Error string `json:"error"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	if body.Error != domain.ErrLastActiveManager.Error() {
		t.Errorf("error = %q, want %q", body.Error, domain.ErrLastActiveManager.Error())
	}
}

func TestWriteErrorDatabaseRejected(t *testing.T) {
	rec := httptest.NewRecorder()
	writeError(rec, &domain.DatabaseRejectedError{
		Message: "cannot update depot-phase EoL items until every branch-phase item is OK or CONDITIONAL_OK",
	})

	if rec.Code != http.StatusConflict {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusConflict)
	}

	var body struct {
		Error string `json:"error"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	if body.Error != "cannot update depot-phase EoL items until every branch-phase item is OK or CONDITIONAL_OK" {
		t.Errorf("error = %q", body.Error)
	}
}

func TestWriteErrorTemplateItemInUse(t *testing.T) {
	rec := httptest.NewRecorder()
	writeError(rec, &domain.TemplateItemInUseError{VehicleCount: 5})

	if rec.Code != http.StatusConflict {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusConflict)
	}

	var body struct {
		Error string `json:"error"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	want := "bu madde 5 araçta kullanılmış, silinemez — pasife çekebilirsiniz"
	if body.Error != want {
		t.Errorf("error = %q, want %q", body.Error, want)
	}
}

func TestWriteErrorUnsupportedImageFormat(t *testing.T) {
	rec := httptest.NewRecorder()
	writeError(rec, domain.ErrUnsupportedImageFormat)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusBadRequest)
	}

	var body struct {
		Error string `json:"error"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	if body.Error != domain.ErrUnsupportedImageFormat.Error() {
		t.Errorf("error = %q, want %q", body.Error, domain.ErrUnsupportedImageFormat.Error())
	}
}
