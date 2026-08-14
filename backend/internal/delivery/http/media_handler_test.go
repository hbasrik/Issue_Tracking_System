package http_test

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	apphttp "github.com/karea/backend/internal/delivery/http"
	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/platform/auth"
	"github.com/karea/backend/internal/repository"
	"github.com/karea/backend/internal/usecase"
)

const seededVIN = "1HGCM82633A004352"

// httpFakeMediaRepo is an in-memory media_attachments table whose existing set
// decides which entity ids the application considers real.
type httpFakeMediaRepo struct {
	rows     []domain.MediaAttachment
	existing map[string]bool
	nextID   int64
}

var _ repository.MediaRepository = (*httpFakeMediaRepo)(nil)

func newHTTPFakeMediaRepo() *httpFakeMediaRepo {
	return &httpFakeMediaRepo{
		existing: map[string]bool{string(domain.MediaEntityVehicle) + "|" + seededVIN: true},
		nextID:   1,
	}
}

func (f *httpFakeMediaRepo) Create(_ context.Context, attachment *domain.MediaAttachment) (int64, error) {
	id := f.nextID
	f.nextID++

	stored := *attachment
	stored.ID = id
	stored.UploadedAt = time.Now()
	f.rows = append(f.rows, stored)
	return id, nil
}

func (f *httpFakeMediaRepo) ListForEntity(_ context.Context, entityType domain.MediaEntityType, entityID string) ([]domain.MediaAttachment, error) {
	var out []domain.MediaAttachment
	for _, row := range f.rows {
		if row.EntityType == entityType && row.EntityID == entityID {
			out = append(out, row)
		}
	}
	return out, nil
}

func (f *httpFakeMediaRepo) EntityExists(_ context.Context, entityType domain.MediaEntityType, entityID string) (bool, error) {
	return f.existing[string(entityType)+"|"+entityID], nil
}

type httpFakeMediaStore struct{ saved int }

func (f *httpFakeMediaStore) Save(_ context.Context, entityType domain.MediaEntityType, entityID, fileName string, content io.Reader) (string, int64, error) {
	body, err := io.ReadAll(content)
	if err != nil {
		return "", 0, err
	}
	f.saved++
	return strings.ToLower(string(entityType)) + "/" + entityID + "/" + fileName, int64(len(body)), nil
}

// newMediaRouter builds the real router with only the media dependencies
// populated, so the test exercises the production routing and RBAC wiring
// rather than a stand-in mux.
func newMediaRouter(media repository.MediaRepository, store usecase.MediaStore) (http.Handler, *auth.Issuer) {
	issuer := auth.NewIssuer("test-secret", time.Hour)
	router := apphttp.NewRouter(apphttp.Deps{
		Issuer: issuer,
		Roles:  newFakeRoleRepo(),
		Media:  usecase.NewMediaUploader(media, store),
	})
	return router, issuer
}

// multipartUpload builds a POST /api/v1/media body.
func multipartUpload(t *testing.T, entityType, entityID, fileName, content string) (*bytes.Buffer, string) {
	t.Helper()

	var body bytes.Buffer
	form := multipart.NewWriter(&body)
	if err := form.WriteField("entity_type", entityType); err != nil {
		t.Fatalf("write entity_type: %v", err)
	}
	if err := form.WriteField("entity_id", entityID); err != nil {
		t.Fatalf("write entity_id: %v", err)
	}
	part, err := form.CreateFormFile("file", fileName)
	if err != nil {
		t.Fatalf("create file part: %v", err)
	}
	if _, err := part.Write([]byte(content)); err != nil {
		t.Fatalf("write file part: %v", err)
	}
	if err := form.Close(); err != nil {
		t.Fatalf("close form: %v", err)
	}
	return &body, form.FormDataContentType()
}

// TestMediaUpload_UnknownEntityReturns404 proves the application-level
// referential integrity reaches the wire: media_attachments is polymorphic and
// has no foreign key, so an upload against a VIN that does not exist must come
// back as an error rather than being quietly stored.
func TestMediaUpload_UnknownEntityReturns404(t *testing.T) {
	media := newHTTPFakeMediaRepo()
	store := &httpFakeMediaStore{}
	router, issuer := newMediaRouter(media, store)

	token, err := issuer.Issue(operatorUserID, domain.RoleCodeOperator)
	if err != nil {
		t.Fatalf("issue token: %v", err)
	}

	body, contentType := multipartUpload(t, "VEHICLE", "NOSUCHVIN00000000", "damage.jpg", "bytes")
	req := httptest.NewRequest(http.MethodPost, "/api/v1/media", body)
	req.Header.Set("Content-Type", contentType)
	req.Header.Set("Authorization", "Bearer "+token)

	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want %d (body: %s)", rec.Code, http.StatusNotFound, rec.Body.String())
	}
	if len(media.rows) != 0 {
		t.Errorf("attachment rows = %d, want 0 (silent insert)", len(media.rows))
	}
	if store.saved != 0 {
		t.Errorf("stored files = %d, want 0", store.saved)
	}
}

// TestMediaUpload_UnknownEntityTypeReturns400 separates "you named something
// that does not exist" (404) from "you named a kind of thing that does not
// exist" (400).
func TestMediaUpload_UnknownEntityTypeReturns400(t *testing.T) {
	media := newHTTPFakeMediaRepo()
	router, issuer := newMediaRouter(media, &httpFakeMediaStore{})

	token, err := issuer.Issue(operatorUserID, domain.RoleCodeOperator)
	if err != nil {
		t.Fatalf("issue token: %v", err)
	}

	body, contentType := multipartUpload(t, "SUPPLIER", "12", "damage.jpg", "bytes")
	req := httptest.NewRequest(http.MethodPost, "/api/v1/media", body)
	req.Header.Set("Content-Type", contentType)
	req.Header.Set("Authorization", "Bearer "+token)

	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d (body: %s)", rec.Code, http.StatusBadRequest, rec.Body.String())
	}
	if len(media.rows) != 0 {
		t.Errorf("attachment rows = %d, want 0", len(media.rows))
	}
}

// TestMediaList_EmptyEntityReturnsEmptyArray pins the shape the Vehicle Detail
// and Issue Detail galleries rely on: an entity with no attachments yields
// items: [], never null and never an error.
func TestMediaList_EmptyEntityReturnsEmptyArray(t *testing.T) {
	router, issuer := newMediaRouter(newHTTPFakeMediaRepo(), &httpFakeMediaStore{})

	token, err := issuer.Issue(operatorUserID, domain.RoleCodeOperator)
	if err != nil {
		t.Fatalf("issue token: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet,
		"/api/v1/media?entity_type=VEHICLE&entity_id="+seededVIN, nil)
	req.Header.Set("Authorization", "Bearer "+token)

	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d (body: %s)", rec.Code, http.StatusOK, rec.Body.String())
	}

	var payload struct {
		Items []domain.MediaAttachment `json:"items"`
	}
	raw := rec.Body.Bytes()
	if err := json.Unmarshal(raw, &payload); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	if payload.Items == nil {
		t.Error("items was null, want an empty array")
	}
	if len(payload.Items) != 0 {
		t.Errorf("items = %d, want 0", len(payload.Items))
	}
	if !strings.Contains(string(raw), `"items":[]`) {
		t.Errorf("body = %s, want items serialized as []", raw)
	}
}

// TestMediaUpload_ExistingEntityStoredAndListed walks the round trip the
// Vehicle Detail screen makes: attach a photo, then read it back.
func TestMediaUpload_ExistingEntityStoredAndListed(t *testing.T) {
	media := newHTTPFakeMediaRepo()
	store := &httpFakeMediaStore{}
	router, issuer := newMediaRouter(media, store)

	token, err := issuer.Issue(operatorUserID, domain.RoleCodeOperator)
	if err != nil {
		t.Fatalf("issue token: %v", err)
	}

	body, contentType := multipartUpload(t, "VEHICLE", seededVIN, "damage.jpg", "some bytes")
	req := httptest.NewRequest(http.MethodPost, "/api/v1/media", body)
	req.Header.Set("Content-Type", contentType)
	req.Header.Set("Authorization", "Bearer "+token)

	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, want %d (body: %s)", rec.Code, http.StatusCreated, rec.Body.String())
	}

	var created domain.MediaAttachment
	if err := json.Unmarshal(rec.Body.Bytes(), &created); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	if created.ID == 0 || created.FileName != "damage.jpg" {
		t.Errorf("created = %+v", created)
	}
	if created.UploadedBy == nil || *created.UploadedBy != operatorUserID {
		t.Errorf("uploaded by = %v, want %d", created.UploadedBy, operatorUserID)
	}

	listReq := httptest.NewRequest(http.MethodGet,
		"/api/v1/media?entity_type=vehicle&entity_id="+seededVIN, nil)
	listReq.Header.Set("Authorization", "Bearer "+token)

	listRec := httptest.NewRecorder()
	router.ServeHTTP(listRec, listReq)

	if listRec.Code != http.StatusOK {
		t.Fatalf("list status = %d, want %d", listRec.Code, http.StatusOK)
	}

	var payload struct {
		Items []domain.MediaAttachment `json:"items"`
	}
	if err := json.Unmarshal(listRec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode list body: %v", err)
	}
	if len(payload.Items) != 1 {
		t.Fatalf("items = %d, want 1", len(payload.Items))
	}
	if payload.Items[0].ID != created.ID {
		t.Errorf("listed id = %d, want %d", payload.Items[0].ID, created.ID)
	}
}

// TestMediaEndpoints_UnpermissionedRoleForbidden keeps the media routes failing
// closed: they sit behind vehicle.view, so a role holding no grants is denied
// rather than allowed by default.
func TestMediaEndpoints_UnpermissionedRoleForbidden(t *testing.T) {
	router, issuer := newMediaRouter(newHTTPFakeMediaRepo(), &httpFakeMediaStore{})

	token, err := issuer.Issue(strangerUserID, domain.RoleCodeManagerAdmin)
	if err != nil {
		t.Fatalf("issue token: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet,
		"/api/v1/media?entity_type=VEHICLE&entity_id="+seededVIN, nil)
	req.Header.Set("Authorization", "Bearer "+token)

	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusForbidden)
	}
}
