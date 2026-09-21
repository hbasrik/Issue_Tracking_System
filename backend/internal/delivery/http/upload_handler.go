package http

import (
	"image"
	"image/jpeg"
	_ "image/gif"
	_ "image/png"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/platform/auth"
)

// listThumbMaxEdge is the long edge of list-card thumbnails (64pt @3x ≈ 192).
const listThumbMaxEdge = 192

// Authenticated uploads are private; browsers must revalidate with a token.
const uploadCacheControl = "private, max-age=3600"

// handleUploadGet serves files from UploadDir after RequireAuth. Filenames are
// 16-byte crypto/rand hex tokens (see storage.LocalDisk) — not sequential —
// but obscurity is not access control: the caller must hold vehicle.view for
// the attachment's VIN (Karar 11). ?thumb=1 returns a long-edge-192 JPEG.
func (s *server) handleUploadGet(w http.ResponseWriter, r *http.Request) {
	rel, ok := safeUploadRel(chi.URLParam(r, "*"))
	if !ok {
		http.NotFound(w, r)
		return
	}

	if s.deps.Media == nil {
		writeError(w, auth.ErrForbidden)
		return
	}
	attachment, err := s.deps.Media.GetByStoragePath(r.Context(), rel)
	if err != nil {
		writeError(w, err)
		return
	}
	if !s.requireCode(w, r, domain.PermissionVehicleView) {
		return
	}
	_ = attachment // VIN-scoped check is vehicle.view for all shop-floor roles.

	abs := filepath.Join(s.deps.UploadDir, filepath.FromSlash(rel))
	if !underDir(s.deps.UploadDir, abs) {
		http.NotFound(w, r)
		return
	}
	if _, err := os.Stat(abs); err != nil {
		http.NotFound(w, r)
		return
	}

	w.Header().Set("Cache-Control", uploadCacheControl)

	if r.URL.Query().Get("thumb") == "1" {
		thumb, err := ensureThumb(s.deps.UploadDir, rel, abs)
		if err != nil {
			http.ServeFile(w, r, abs)
			return
		}
		http.ServeFile(w, r, thumb)
		return
	}

	http.ServeFile(w, r, abs)
}

func safeUploadRel(raw string) (string, bool) {
	cleaned := path.Clean("/" + raw)
	rel := strings.TrimPrefix(cleaned, "/")
	if rel == "" || rel == "." || strings.HasPrefix(rel, "../") || strings.Contains(rel, "..") {
		return "", false
	}
	return rel, true
}

func underDir(root, abs string) bool {
	rootAbs, err := filepath.Abs(root)
	if err != nil {
		return false
	}
	fileAbs, err := filepath.Abs(abs)
	if err != nil {
		return false
	}
	sep := string(os.PathSeparator)
	return fileAbs == rootAbs || strings.HasPrefix(fileAbs, rootAbs+sep)
}

func ensureThumb(uploadDir, rel, src string) (string, error) {
	thumb := filepath.Join(uploadDir, ".thumbs", filepath.FromSlash(rel)+".jpg")
	srcInfo, err := os.Stat(src)
	if err != nil {
		return "", err
	}
	if info, err := os.Stat(thumb); err == nil && !info.ModTime().Before(srcInfo.ModTime()) {
		return thumb, nil
	}

	if err := os.MkdirAll(filepath.Dir(thumb), 0o755); err != nil {
		return "", err
	}

	in, err := os.Open(src)
	if err != nil {
		return "", err
	}
	defer in.Close()

	img, _, err := image.Decode(in)
	if err != nil {
		return "", err
	}

	tmp := thumb + ".tmp"
	out, err := os.Create(tmp)
	if err != nil {
		return "", err
	}
	encErr := jpeg.Encode(out, resizeMaxEdge(img, listThumbMaxEdge), &jpeg.Options{Quality: 70})
	closeErr := out.Close()
	if encErr != nil {
		os.Remove(tmp)
		return "", encErr
	}
	if closeErr != nil {
		os.Remove(tmp)
		return "", closeErr
	}
	if err := os.Rename(tmp, thumb); err != nil {
		os.Remove(tmp)
		return "", err
	}
	return thumb, nil
}

func resizeMaxEdge(src image.Image, maxEdge int) image.Image {
	b := src.Bounds()
	sw, sh := b.Dx(), b.Dy()
	if sw <= 0 || sh <= 0 {
		return src
	}
	nw, nh := sw, sh
	if sw > maxEdge || sh > maxEdge {
		if sw >= sh {
			nw = maxEdge
			nh = sh * maxEdge / sw
		} else {
			nh = maxEdge
			nw = sw * maxEdge / sh
		}
	}
	if nw < 1 {
		nw = 1
	}
	if nh < 1 {
		nh = 1
	}
	if nw == sw && nh == sh {
		return src
	}

	dst := image.NewRGBA(image.Rect(0, 0, nw, nh))
	for y := 0; y < nh; y++ {
		sy := b.Min.Y + y*sh/nh
		for x := 0; x < nw; x++ {
			sx := b.Min.X + x*sw/nw
			dst.Set(x, y, src.At(sx, sy))
		}
	}
	return dst
}
