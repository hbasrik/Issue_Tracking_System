package applog

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"
)

// rotateWriter appends to path and renames to path.1 .. path.N when MaxBytes
// is exceeded (simple size-based rotation; no compression).
type rotateWriter struct {
	mu         sync.Mutex
	path       string
	maxBytes   int64
	maxBackups int
	file       *os.File
	size       int64
}

func openRotate(path string, maxBytes int64, maxBackups int) (*rotateWriter, error) {
	rw := &rotateWriter{path: path, maxBytes: maxBytes, maxBackups: maxBackups}
	if err := rw.open(); err != nil {
		return nil, err
	}
	return rw, nil
}

func (w *rotateWriter) open() error {
	f, err := os.OpenFile(w.path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		return fmt.Errorf("applog open %s: %w", w.path, err)
	}
	info, err := f.Stat()
	if err != nil {
		_ = f.Close()
		return err
	}
	w.file = f
	w.size = info.Size()
	return nil
}

func (w *rotateWriter) Write(p []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.file == nil {
		return 0, fmt.Errorf("applog: closed")
	}
	if w.size+int64(len(p)) > w.maxBytes && w.size > 0 {
		if err := w.rotateLocked(); err != nil {
			return 0, err
		}
	}
	n, err := w.file.Write(p)
	w.size += int64(n)
	return n, err
}

func (w *rotateWriter) Close() error {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.file == nil {
		return nil
	}
	err := w.file.Close()
	w.file = nil
	return err
}

func (w *rotateWriter) rotateLocked() error {
	_ = w.file.Close()
	w.file = nil

	for i := w.maxBackups - 1; i >= 1; i-- {
		src := fmt.Sprintf("%s.%d", w.path, i)
		dst := fmt.Sprintf("%s.%d", w.path, i+1)
		if _, err := os.Stat(src); err != nil {
			continue
		}
		_ = os.Remove(dst)
		_ = os.Rename(src, dst)
	}
	backup := w.path + ".1"
	_ = os.Remove(backup)
	if err := os.Rename(w.path, backup); err != nil && !os.IsNotExist(err) {
		return err
	}
	// Drop the oldest beyond maxBackups.
	_ = os.Remove(fmt.Sprintf("%s.%d", w.path, w.maxBackups+1))
	_ = os.Remove(filepath.Join(filepath.Dir(w.path), filepath.Base(w.path)+fmt.Sprintf(".%d", w.maxBackups+1)))
	return w.open()
}
