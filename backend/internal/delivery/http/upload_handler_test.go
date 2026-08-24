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
	"github.com/karea/backend/internal/platform/auth"
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

func newUploadRouter(t *testing.T, uploadDir string) http.Handler {
	t.Helper()
	issuer := auth.NewIssuer("test-secret", time.Hour)
	return apphttp.NewRouter(apphttp.Deps{
		Issuer:    issuer,
		Roles:     newFakeRoleRepo(),
		UploadDir: uploadDir,
	})
}

func TestUploadGet_SetsImmutableCacheControl(t *testing.T) {
	dir := t.TempDir()
	rel := filepath.Join("issue", "1", "photo.jpg")
	writeNoiseJPEG(t, filepath.Join(dir, rel), 80, 60)

	router := newUploadRouter(t, dir)
	req := httptest.NewRequest(http.MethodGet, "/uploads/issue/1/photo.jpg", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	cc := rec.Header().Get("Cache-Control")
	if !strings.Contains(cc, "max-age=31536000") || !strings.Contains(cc, "immutable") {
		t.Fatalf("Cache-Control = %q, want immutable year-long cache", cc)
	}
}

func TestUploadGet_ThumbIsMuchSmallerThanOriginal(t *testing.T) {
	dir := t.TempDir()
	rel := filepath.Join("issue", "1", "photo.jpg")
	writeNoiseJPEG(t, filepath.Join(dir, rel), 1200, 900)

	router := newUploadRouter(t, dir)

	orig := httptest.NewRecorder()
	router.ServeHTTP(orig, httptest.NewRequest(http.MethodGet, "/uploads/issue/1/photo.jpg", nil))
	if orig.Code != http.StatusOK {
		t.Fatalf("original status = %d", orig.Code)
	}

	thumb := httptest.NewRecorder()
	router.ServeHTTP(thumb, httptest.NewRequest(http.MethodGet, "/uploads/issue/1/photo.jpg?thumb=1", nil))
	if thumb.Code != http.StatusOK {
		t.Fatalf("thumb status = %d", thumb.Code)
	}
	if ct := thumb.Header().Get("Content-Type"); !strings.HasPrefix(ct, "image/jpeg") {
		t.Fatalf("thumb content-type = %q, want jpeg", ct)
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
}

func TestUploadGet_RejectsPathTraversal(t *testing.T) {
	dir := t.TempDir()
	router := newUploadRouter(t, dir)
	req := httptest.NewRequest(http.MethodGet, "/uploads/../upload_handler.go", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
}
