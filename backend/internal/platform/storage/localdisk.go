// Package storage holds the file-persistence backends for media attachments.
//
// Karar 8 defers the cloud-storage decision, so the only implementation today
// writes to local disk. Everything above it depends on the usecase.MediaStore
// interface, so swapping in S3 later is a wiring change rather than a rewrite:
// media_attachments.storage_path is already an opaque string.
package storage

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/karea/backend/internal/domain"
)

// LocalDisk stores uploads beneath a single root directory.
type LocalDisk struct {
	root string
}

// NewLocalDisk constructs a LocalDisk rooted at the given directory.
func NewLocalDisk(root string) *LocalDisk {
	return &LocalDisk{root: root}
}

// Save writes the content to <root>/<entity type>/<entity id>/<random>.<ext>
// and returns the path relative to the root.
//
// The stored name is randomly generated rather than derived from the client's
// file name: the original is kept in the database column instead, so a crafted
// name can neither escape the root nor collide with an existing upload.
func (d *LocalDisk) Save(
	_ context.Context,
	entityType domain.MediaEntityType,
	entityID, fileName string,
	content io.Reader,
) (storagePath string, size int64, err error) {
	token, err := randomToken()
	if err != nil {
		return "", 0, err
	}

	relativeDir := filepath.Join(strings.ToLower(string(entityType)), sanitizeSegment(entityID))
	if err := os.MkdirAll(filepath.Join(d.root, relativeDir), 0o755); err != nil {
		return "", 0, fmt.Errorf("create upload directory: %w", err)
	}

	relativePath := filepath.Join(relativeDir, token+strings.ToLower(filepath.Ext(fileName)))
	file, err := os.Create(filepath.Join(d.root, relativePath))
	if err != nil {
		return "", 0, fmt.Errorf("create upload file: %w", err)
	}
	defer file.Close()

	size, err = io.Copy(file, content)
	if err != nil {
		// Do not leave a half-written file behind for a failed upload.
		os.Remove(filepath.Join(d.root, relativePath))
		return "", 0, fmt.Errorf("write upload file: %w", err)
	}
	return filepath.ToSlash(relativePath), size, nil
}

// sanitizeSegment reduces an id to characters that are safe in a path segment,
// so a VIN or numeric id can be used as a directory name.
func sanitizeSegment(raw string) string {
	return strings.Map(func(r rune) rune {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9', r == '-', r == '_':
			return r
		default:
			return '_'
		}
	}, raw)
}

func randomToken() (string, error) {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("generate storage name: %w", err)
	}
	return hex.EncodeToString(buf), nil
}
