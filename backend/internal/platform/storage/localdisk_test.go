package storage_test

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/platform/storage"
)

// TestLocalDiskSave writes a file and reports its path relative to the root.
func TestLocalDiskSave(t *testing.T) {
	root := t.TempDir()
	store := storage.NewLocalDisk(root)

	path, size, err := store.Save(context.Background(),
		domain.MediaEntityVehicle, "1HGCM82633A004352", "damage.JPG",
		strings.NewReader("some bytes"))
	if err != nil {
		t.Fatalf("save: %v", err)
	}

	if size != int64(len("some bytes")) {
		t.Errorf("size = %d, want %d", size, len("some bytes"))
	}
	if !strings.HasPrefix(path, "vehicle/1HGCM82633A004352/") {
		t.Errorf("path = %q, want it under the entity directory", path)
	}
	if filepath.Ext(path) != ".jpg" {
		t.Errorf("extension = %q, want .jpg", filepath.Ext(path))
	}

	content, err := os.ReadFile(filepath.Join(root, path))
	if err != nil {
		t.Fatalf("read back: %v", err)
	}
	if string(content) != "some bytes" {
		t.Errorf("content = %q, want %q", content, "some bytes")
	}
}

// TestLocalDiskSave_NameIsNotClientControlled is the security property: the
// client's file name is metadata, never a path. A traversal attempt must end
// up inside the root like any other upload.
func TestLocalDiskSave_NameIsNotClientControlled(t *testing.T) {
	root := t.TempDir()
	store := storage.NewLocalDisk(root)

	path, _, err := store.Save(context.Background(),
		domain.MediaEntityIssue, "../../etc", "../../../../etc/passwd",
		strings.NewReader("bytes"))
	if err != nil {
		t.Fatalf("save: %v", err)
	}

	absolute := filepath.Join(root, path)
	if !strings.HasPrefix(absolute, root+string(os.PathSeparator)) {
		t.Fatalf("path %q escaped the root %q", absolute, root)
	}
	if strings.Contains(path, "..") {
		t.Errorf("path = %q, want no traversal segments", path)
	}
	if _, err := os.Stat(absolute); err != nil {
		t.Errorf("stat written file: %v", err)
	}
}

// TestLocalDiskSave_NamesDoNotCollide keeps two uploads of the same file name
// against the same entity from overwriting one another.
func TestLocalDiskSave_NamesDoNotCollide(t *testing.T) {
	root := t.TempDir()
	store := storage.NewLocalDisk(root)
	ctx := context.Background()

	first, _, err := store.Save(ctx, domain.MediaEntityVehicle, "VIN1", "photo.jpg", strings.NewReader("a"))
	if err != nil {
		t.Fatalf("first save: %v", err)
	}
	second, _, err := store.Save(ctx, domain.MediaEntityVehicle, "VIN1", "photo.jpg", strings.NewReader("b"))
	if err != nil {
		t.Fatalf("second save: %v", err)
	}

	if first == second {
		t.Fatalf("both uploads landed on %q", first)
	}
}
