package http_test

import (
	"image"
	"image/color"
	"image/jpeg"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	apphttp "github.com/karea/backend/internal/delivery/http"
	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/platform/auth"
	"github.com/karea/backend/internal/usecase"
)

func writeNoiseJPEG(t *testing.T, path string, w, h int) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			img.Set(x, y, color.RGBA{R: uint8(x), G: uint8(y), B: uint8(x * y), A: 255})
		}
	}
	f, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	if err := jpeg.Encode(f, img, &jpeg.Options{Quality: 92}); err != nil {
		t.Fatal(err)
	}
}

func newUploadRouter(t *testing.T, uploadDir string, media *httpFakeMediaRepo) (http.Handler, *auth.Issuer) {
	t.Helper()
	issuer := auth.NewIssuer("test-secret-at-least-32-chars-long!!", time.Hour)
	if media == nil {
		media = newHTTPFakeMediaRepo()
	}
	router := apphttp.NewRouter(apphttp.Deps{
		Issuer:    issuer,
		Roles:     newFakeRoleRepo(),
		UploadDir: uploadDir,
		Media:     usecase.NewMediaUploader(media, &httpFakeMediaStore{}),
	})
	return router, issuer
}

func TestUploadGet_RequiresAuth(t *testing.T) {
	dir := t.TempDir()
	rel := filepath.ToSlash(filepath.Join("issue", "1", "photo.jpg"))
	writeNoiseJPEG(t, filepath.Join(dir, filepath.FromSlash(rel)), 80, 60)
	media := newHTTPFakeMediaRepo()
	media.rows = append(media.rows, domain.MediaAttachment{
		VIN: seededVIN, StoragePath: rel, EntityType: domain.MediaEntityIssue, EntityID: "1",
	})
	router, _ := newUploadRouter(t, dir, media)

	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/uploads/"+rel, nil))
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", rec.Code)
	}
}

func TestUploadGet_ForbiddenWithoutVehicleView(t *testing.T) {
	dir := t.TempDir()
	rel := filepath.ToSlash(filepath.Join("issue", "1", "photo.jpg"))
	writeNoiseJPEG(t, filepath.Join(dir, filepath.FromSlash(rel)), 80, 60)
	media := newHTTPFakeMediaRepo()
	media.rows = append(media.rows, domain.MediaAttachment{
		VIN: seededVIN, StoragePath: rel, EntityType: domain.MediaEntityIssue, EntityID: "1",
	})
	router, issuer := newUploadRouter(t, dir, media)

	// strangerUserID has no permissions in fakeRoleRepo.
	token, err := issuer.Issue(strangerUserID, domain.RoleCodeManagerAdmin)
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodGet, "/uploads/"+rel, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want 403", rec.Code)
	}
}

func TestUploadGet_AllowsViewer(t *testing.T) {
	dir := t.TempDir()
	rel := filepath.ToSlash(filepath.Join("issue", "1", "photo.jpg"))
	writeNoiseJPEG(t, filepath.Join(dir, filepath.FromSlash(rel)), 80, 60)
	media := newHTTPFakeMediaRepo()
	media.rows = append(media.rows, domain.MediaAttachment{
		VIN: seededVIN, StoragePath: rel, EntityType: domain.MediaEntityIssue, EntityID: "1",
	})
	router, issuer := newUploadRouter(t, dir, media)

	token, err := issuer.Issue(operatorUserID, domain.RoleCodeOperator)
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodGet, "/uploads/"+rel, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 body=%s", rec.Code, rec.Body.String())
	}
	cc := rec.Header().Get("Cache-Control")
	if !strings.Contains(cc, "private") {
		t.Fatalf("Cache-Control = %q, want private", cc)
	}
}

func TestUploadGet_ThumbIsMuchSmallerThanOriginal(t *testing.T) {
	dir := t.TempDir()
	rel := filepath.ToSlash(filepath.Join("issue", "1", "photo.jpg"))
	writeNoiseJPEG(t, filepath.Join(dir, filepath.FromSlash(rel)), 1200, 900)
	media := newHTTPFakeMediaRepo()
	media.rows = append(media.rows, domain.MediaAttachment{
		VIN: seededVIN, StoragePath: rel, EntityType: domain.MediaEntityIssue, EntityID: "1",
	})
	router, issuer := newUploadRouter(t, dir, media)
	token, _ := issuer.Issue(operatorUserID, domain.RoleCodeOperator)

	orig := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/uploads/"+rel, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	router.ServeHTTP(orig, req)
	if orig.Code != http.StatusOK {
		t.Fatalf("original status = %d", orig.Code)
	}

	thumb := httptest.NewRecorder()
	treq := httptest.NewRequest(http.MethodGet, "/uploads/"+rel+"?thumb=1", nil)
	treq.Header.Set("Authorization", "Bearer "+token)
	router.ServeHTTP(thumb, treq)
	if thumb.Code != http.StatusOK {
		t.Fatalf("thumb status = %d", thumb.Code)
	}
	if thumb.Body.Len() == 0 || thumb.Body.Len() >= orig.Body.Len() {
		t.Fatalf("thumb %d bytes, original %d; want thumb smaller", thumb.Body.Len(), orig.Body.Len())
	}
	if cl := thumb.Header().Get("Content-Length"); cl != "" {
		n, _ := strconv.Atoi(cl)
		if n != thumb.Body.Len() {
			t.Fatalf("content-length %d != body %d", n, thumb.Body.Len())
		}
	}

	md := httptest.NewRecorder()
	mreq := httptest.NewRequest(http.MethodGet, "/uploads/"+rel+"?thumb=md", nil)
	mreq.Header.Set("Authorization", "Bearer "+token)
	router.ServeHTTP(md, mreq)
	if md.Code != http.StatusOK {
		t.Fatalf("md thumb status = %d", md.Code)
	}
	if md.Body.Len() == 0 || md.Body.Len() >= orig.Body.Len() {
		t.Fatalf("md %d bytes, original %d; want md smaller", md.Body.Len(), orig.Body.Len())
	}
	if md.Body.Len() <= thumb.Body.Len() {
		t.Fatalf("md %d bytes should be larger than sm thumb %d", md.Body.Len(), thumb.Body.Len())
	}
}

func TestUploadGet_RejectsPathTraversal(t *testing.T) {
	dir := t.TempDir()
	router, issuer := newUploadRouter(t, dir, nil)
	token, _ := issuer.Issue(operatorUserID, domain.RoleCodeOperator)
	req := httptest.NewRequest(http.MethodGet, "/uploads/../upload_handler.go", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
}
