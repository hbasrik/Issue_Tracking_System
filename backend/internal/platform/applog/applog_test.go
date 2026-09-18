package applog_test

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/karea/backend/internal/platform/applog"
)

func TestRedact_Secrets(t *testing.T) {
	t.Parallel()
	if applog.Redact(`{"password":"secret12"}`) != "[REDACTED]" {
		t.Fatal("password body must redact")
	}
	if applog.Redact("Authorization: Bearer abc") != "[REDACTED]" {
		t.Fatal("bearer must redact")
	}
	if got := applog.Redact("vin=ABC"); got != "vin=ABC" {
		t.Fatalf("safe string changed: %q", got)
	}
}

func TestInit_WritesFileAndStderrMirror(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "karea.log")
	if err := applog.Init(applog.Options{
		Level:      applog.LevelInfo,
		FilePath:   path,
		MaxBytes:   1 << 20,
		MaxBackups: 2,
	}); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(applog.Close)

	applog.Info("hello", "request_id", "req-1")
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(raw), "hello") || !strings.Contains(string(raw), "request_id=req-1") {
		t.Fatalf("file contents: %s", raw)
	}
}

func TestRotate_CreatesBackup(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "rot.log")
	if err := applog.Init(applog.Options{
		Level:      applog.LevelInfo,
		FilePath:   path,
		MaxBytes:   64,
		MaxBackups: 2,
	}); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(applog.Close)

	for i := 0; i < 40; i++ {
		applog.Info("pad-line-for-rotation-xxxxxxxxxxxxxxxx", "n", i)
	}
	if _, err := os.Stat(path + ".1"); err != nil {
		t.Fatalf("expected rotated backup: %v", err)
	}
}

func TestLevel_FiltersDebug(t *testing.T) {
	var buf bytes.Buffer
	applog.SetOutputForTest(&buf, applog.LevelWarn)
	t.Cleanup(func() { applog.SetOutputForTest(nil, applog.LevelInfo) })

	applog.Debug("hidden")
	applog.Info("also-hidden")
	applog.Warn("visible")
	out := buf.String()
	if strings.Contains(out, "hidden") {
		t.Fatalf("debug/info leaked: %s", out)
	}
	if !strings.Contains(out, "visible") {
		t.Fatalf("warn missing: %s", out)
	}
}
