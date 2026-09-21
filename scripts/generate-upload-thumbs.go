// Command: generate sm + md JPEG derivatives under uploads/.thumbs/
// without modifying originals (Rule 7).
//
//	go run ./scripts/generate-upload-thumbs.go [uploadDir]
//
// Defaults to ./backend/uploads. Safe to re-run; skips derivatives newer
// than their source.
package main

import (
	"fmt"
	"image"
	"image/jpeg"
	_ "image/gif"
	_ "image/png"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// Keep in sync with shared/mediaThumbs.ts and upload_handler.go.
const (
	smMaxEdge = 192
	mdMaxEdge = 800
)

func main() {
	root := "backend/uploads"
	if len(os.Args) > 1 {
		root = os.Args[1]
	}
	rootAbs, err := filepath.Abs(root)
	if err != nil {
		fatal(err)
	}
	var made, skipped, failed int
	err = filepath.Walk(rootAbs, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if info.IsDir() {
			if filepath.Base(path) == ".thumbs" {
				return filepath.SkipDir
			}
			return nil
		}
		ext := strings.ToLower(filepath.Ext(path))
		if ext != ".jpg" && ext != ".jpeg" && ext != ".png" && ext != ".gif" {
			return nil
		}
		rel, err := filepath.Rel(rootAbs, path)
		if err != nil {
			return err
		}
		for _, spec := range []struct {
			suffix  string
			maxEdge int
			quality int
		}{
			{".jpg", smMaxEdge, 70},
			{".md.jpg", mdMaxEdge, 78},
		} {
			out := filepath.Join(rootAbs, ".thumbs", rel+spec.suffix)
			if isFresh(out, info.ModTime()) {
				skipped++
				continue
			}
			if err := writeThumb(path, out, spec.maxEdge, spec.quality); err != nil {
				fmt.Fprintf(os.Stderr, "fail %s (%s): %v\n", rel, spec.suffix, err)
				failed++
				continue
			}
			fmt.Printf("wrote %s\n", filepath.Join(".thumbs", rel+spec.suffix))
			made++
		}
		return nil
	})
	if err != nil {
		fatal(err)
	}
	fmt.Printf("done made=%d skipped=%d failed=%d root=%s\n", made, skipped, failed, rootAbs)
	if failed > 0 {
		fmt.Fprintf(os.Stderr, "warning: %d derivative(s) failed (corrupt/unreadable sources left unchanged)\n", failed)
	}
}

func isFresh(path string, srcMod time.Time) bool {
	info, err := os.Stat(path)
	if err != nil {
		return false
	}
	return !info.ModTime().Before(srcMod)
}

func writeThumb(src, dst string, maxEdge, quality int) error {
	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		return err
	}
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	img, _, err := image.Decode(in)
	if err != nil {
		return err
	}
	tmp := dst + ".tmp"
	out, err := os.Create(tmp)
	if err != nil {
		return err
	}
	encErr := jpeg.Encode(out, resizeMaxEdge(img, maxEdge), &jpeg.Options{Quality: quality})
	closeErr := out.Close()
	if encErr != nil {
		_ = os.Remove(tmp)
		return encErr
	}
	if closeErr != nil {
		_ = os.Remove(tmp)
		return closeErr
	}
	return os.Rename(tmp, dst)
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

func fatal(err error) {
	fmt.Fprintln(os.Stderr, err)
	os.Exit(1)
}
