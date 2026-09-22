package usecase_test

import (
	"bytes"
	"context"
	"errors"
	"image"
	"image/color"
	"image/jpeg"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/usecase"
)

func tinyJPEG(t *testing.T) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, 1, 1))
	img.Set(0, 0, color.RGBA{R: 200, G: 10, B: 10, A: 255})
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, img, &jpeg.Options{Quality: 90}); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

// TestUploadMedia_UnknownEntityRejected is the core guarantee of Karar 8's
// polymorphic table: because media_attachments has no foreign key, an upload
// aimed at a vehicle that does not exist must be refused by the application
// rather than inserted as a dangling row. The store is asserted empty too —
// rejecting the row but writing the file would leave an orphan on disk.
func TestUploadMedia_UnknownEntityRejected(t *testing.T) {
	media := newFakeMediaRepo()
	store := &fakeMediaStore{}
	uploader := usecase.NewMediaUploader(media, store)

	_, err := uploader.Upload(context.Background(), usecase.UploadMediaInput{
		EntityType: domain.MediaEntityVehicle,
		EntityID:   "NOSUCHVIN00000000",
		FileName:   "damage.jpg",
		MimeType:   "image/jpeg",
		Content:    strings.NewReader("bytes"),
		UploadedBy: 7,
	})

	if !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("err = %v, want domain.ErrNotFound", err)
	}
	if len(media.rows) != 0 {
		t.Errorf("attachment rows = %d, want 0 (silent insert)", len(media.rows))
	}
	if len(store.saved) != 0 {
		t.Errorf("stored files = %v, want none", store.saved)
	}
}

// TestUploadMedia_UnknownIssueRejected covers the numeric-id entity types, in
// which an id can be well-formed and still reference nothing.
func TestUploadMedia_UnknownIssueRejected(t *testing.T) {
	media := newFakeMediaRepo()
	uploader := usecase.NewMediaUploader(media, &fakeMediaStore{})

	_, err := uploader.Upload(context.Background(), usecase.UploadMediaInput{
		EntityType: domain.MediaEntityIssue,
		EntityID:   "9999",
		FileName:   "repair.jpg",
		Content:    strings.NewReader("bytes"),
		UploadedBy: 7,
	})

	if !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("err = %v, want domain.ErrNotFound", err)
	}
	if len(media.rows) != 0 {
		t.Errorf("attachment rows = %d, want 0", len(media.rows))
	}
}

// TestUploadMedia_MalformedEntityIDRejected keeps a non-numeric id from
// reaching the repository, where it would surface as a failed SQL cast rather
// than a clear client error.
func TestUploadMedia_MalformedEntityIDRejected(t *testing.T) {
	media := newFakeMediaRepo()
	media.seedEntity(domain.MediaEntityIssue, "41")
	uploader := usecase.NewMediaUploader(media, &fakeMediaStore{})

	_, err := uploader.Upload(context.Background(), usecase.UploadMediaInput{
		EntityType: domain.MediaEntityIssue,
		EntityID:   "not-a-number",
		FileName:   "repair.jpg",
		Content:    strings.NewReader("bytes"),
		UploadedBy: 7,
	})

	if !errors.Is(err, domain.ErrInvalidEnumValue) {
		t.Fatalf("err = %v, want domain.ErrInvalidEnumValue", err)
	}
}

// TestUploadMedia_ExistingEntityAccepted is the happy path, and pins that the
// row records where the file went and who put it there.
func TestUploadMedia_ExistingEntityAccepted(t *testing.T) {
	const vin = "1HGCM82633A004352"

	media := newFakeMediaRepo()
	media.seedEntity(domain.MediaEntityVehicle, vin)
	store := &fakeMediaStore{}
	uploader := usecase.NewMediaUploader(media, store)

	attachment, err := uploader.Upload(context.Background(), usecase.UploadMediaInput{
		EntityType: domain.MediaEntityVehicle,
		EntityID:   vin,
		FileName:   "/tmp/client/path/damage.jpg",
		MimeType:   "image/jpeg",
		Content:    bytes.NewReader(tinyJPEG(t)),
		UploadedBy: 7,
	})
	if err != nil {
		t.Fatalf("upload: %v", err)
	}

	if attachment.ID == 0 {
		t.Error("attachment id was not assigned")
	}
	// The client's directory path is not reproduced on the server.
	if attachment.FileName != "damage.jpg" {
		t.Errorf("file name = %q, want %q", attachment.FileName, "damage.jpg")
	}
	wantSize := int64(len(tinyJPEG(t)))
	if attachment.FileSize != wantSize {
		t.Errorf("file size = %d, want %d", attachment.FileSize, wantSize)
	}
	if attachment.UploadedBy == nil || *attachment.UploadedBy != 7 {
		t.Errorf("uploaded by = %v, want 7", attachment.UploadedBy)
	}
	if attachment.VIN != vin {
		t.Errorf("vin = %q, want %q", attachment.VIN, vin)
	}
	if len(store.saved) != 1 {
		t.Errorf("stored files = %v, want exactly one", store.saved)
	}
}

// TestListMedia_EmptyEntityReturnsEmptySlice keeps the Vehicle Detail and
// Issue Detail galleries from erroring on a vehicle nobody has photographed
// yet: no attachments is an empty list, not a failure and not a nil that would
// serialize as JSON null.
func TestListMedia_EmptyEntityReturnsEmptySlice(t *testing.T) {
	const vin = "1HGCM82633A004352"

	media := newFakeMediaRepo()
	media.seedEntity(domain.MediaEntityVehicle, vin)
	uploader := usecase.NewMediaUploader(media, &fakeMediaStore{})

	attachments, err := uploader.ListForEntity(context.Background(), domain.MediaEntityVehicle, vin)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if attachments == nil {
		t.Fatal("attachments = nil, want an empty slice")
	}
	if len(attachments) != 0 {
		t.Errorf("attachments = %d, want 0", len(attachments))
	}
}

// TestListMedia_ReturnsOnlyMatchingEntity guards the polymorphic key: two
// entities can share an id, so both halves of the key must be matched.
func TestListMedia_ReturnsOnlyMatchingEntity(t *testing.T) {
	media := newFakeMediaRepo()
	media.seedEntity(domain.MediaEntityIssue, "41")
	media.seedEntity(domain.MediaEntityChecklistItemProgress, "41")
	uploader := usecase.NewMediaUploader(media, &fakeMediaStore{})

	ctx := context.Background()
	for _, entityType := range []domain.MediaEntityType{
		domain.MediaEntityIssue,
		domain.MediaEntityChecklistItemProgress,
	} {
		if _, err := uploader.Upload(ctx, usecase.UploadMediaInput{
			EntityType: entityType,
			EntityID:   "41",
			FileName:   "photo.jpg",
			MimeType:   "image/jpeg",
			Content:    bytes.NewReader(tinyJPEG(t)),
			UploadedBy: 7,
		}); err != nil {
			t.Fatalf("upload for %s: %v", entityType, err)
		}
	}

	attachments, err := uploader.ListForEntity(ctx, domain.MediaEntityIssue, "41")
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(attachments) != 1 {
		t.Fatalf("attachments = %d, want 1", len(attachments))
	}
	if attachments[0].EntityType != domain.MediaEntityIssue {
		t.Errorf("entity type = %q, want ISSUE", attachments[0].EntityType)
	}
}

// TestUploadMedia_WritesVINFromEntityContext pins Karar 11: the VIN is taken
// from the parent entity in the same lookup that proves it exists, not from a
// second query and not from the client.
func TestUploadMedia_WritesVINFromEntityContext(t *testing.T) {
	const vin = "N7V1K1SA9SK000001"

	media := newFakeMediaRepo()
	media.seedEntityVIN(domain.MediaEntityIssue, "41", vin)
	uploader := usecase.NewMediaUploader(media, &fakeMediaStore{})

	attachment, err := uploader.Upload(context.Background(), usecase.UploadMediaInput{
		EntityType: domain.MediaEntityIssue,
		EntityID:   "41",
		FileName:   "photo.jpg",
		MimeType:   "image/jpeg",
		Content:    bytes.NewReader(tinyJPEG(t)),
		UploadedBy: 7,
	})
	if err != nil {
		t.Fatalf("upload: %v", err)
	}
	if attachment.VIN != vin {
		t.Fatalf("vin = %q, want %q", attachment.VIN, vin)
	}
	if media.rows[0].VIN != vin {
		t.Fatalf("stored vin = %q, want %q", media.rows[0].VIN, vin)
	}
}

func TestUploadMedia_RejectsHEIC(t *testing.T) {
	const vin = "1HGCM82633A004352"
	media := newFakeMediaRepo()
	media.seedEntity(domain.MediaEntityVehicle, vin)
	store := &fakeMediaStore{}
	uploader := usecase.NewMediaUploader(media, store)

	heic := []byte{
		0x00, 0x00, 0x00, 0x18,
		'f', 't', 'y', 'p',
		'h', 'e', 'i', 'c',
		0x00, 0x00, 0x00, 0x00,
	}
	_, err := uploader.Upload(context.Background(), usecase.UploadMediaInput{
		EntityType: domain.MediaEntityVehicle,
		EntityID:   vin,
		FileName:   "IMG_001.HEIC",
		MimeType:   "image/heic",
		Content:    strings.NewReader(string(heic)),
		UploadedBy: 7,
	})
	if !errors.Is(err, domain.ErrUnsupportedImageFormat) {
		t.Fatalf("err = %v, want ErrUnsupportedImageFormat", err)
	}
	if len(store.saved) != 0 {
		t.Errorf("stored files = %v, want none", store.saved)
	}
	if len(media.rows) != 0 {
		t.Errorf("attachment rows = %d, want 0", len(media.rows))
	}
}

// Truncated JFIF that may still sniff as JPEG but Go's decoder rejects —
// mirrors backend/uploads/issue_resolution/68/…jpg (Rule 7: leave that file).
func TestUploadMedia_RejectsUndecodableJPEG(t *testing.T) {
	const vin = "1HGCM82633A004352"
	media := newFakeMediaRepo()
	media.seedEntity(domain.MediaEntityVehicle, vin)
	store := &fakeMediaStore{}
	uploader := usecase.NewMediaUploader(media, store)

	corrupt := []byte{
		0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10,
		'J', 'F', 'I', 'F', 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
		0x00, 0x01, 0x00, 0x00,
		0x00, 0x01, 0x02, 0x03,
	}
	_, err := uploader.Upload(context.Background(), usecase.UploadMediaInput{
		EntityType: domain.MediaEntityVehicle,
		EntityID:   vin,
		FileName:   "broken.jpg",
		MimeType:   "image/jpeg",
		Content:    bytes.NewReader(corrupt),
		UploadedBy: 7,
	})
	if !errors.Is(err, domain.ErrUndecodableImage) {
		t.Fatalf("err = %v, want ErrUndecodableImage", err)
	}
	if len(store.saved) != 0 {
		t.Errorf("stored files = %v, want none", store.saved)
	}
}

// Real on-disk corrupt resolution photo (read-only; do not delete — Rule 7).
func TestUploadMedia_RejectsKnownCorruptIssueResolution68(t *testing.T) {
	path := filepath.Join("..", "..", "uploads", "issue_resolution", "68",
		"0bf4c9223b4f0ce76c80b6ada3dc577d.jpg")
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Skipf("fixture not present: %v", err)
	}
	const vin = "1HGCM82633A004352"
	media := newFakeMediaRepo()
	media.seedEntity(domain.MediaEntityVehicle, vin)
	store := &fakeMediaStore{}
	uploader := usecase.NewMediaUploader(media, store)

	_, err = uploader.Upload(context.Background(), usecase.UploadMediaInput{
		EntityType: domain.MediaEntityVehicle,
		EntityID:   vin,
		FileName:   "0bf4c9223b4f0ce76c80b6ada3dc577d.jpg",
		MimeType:   "image/jpeg",
		Content:    bytes.NewReader(raw),
		UploadedBy: 7,
	})
	if !errors.Is(err, domain.ErrUndecodableImage) {
		t.Fatalf("err = %v, want ErrUndecodableImage (corrupt issue_resolution/68)", err)
	}
	if len(store.saved) != 0 {
		t.Errorf("stored files = %v, want none", store.saved)
	}
}

// TestListMediaByVIN_ReturnsEveryEntityType is the Vehicle Detail "all photos"
// query: issue, checklist and vehicle attachments for one VIN come back together.
func TestListMediaByVIN_ReturnsEveryEntityType(t *testing.T) {
	const vin = "N7V1K1SA9SK000001"

	media := newFakeMediaRepo()
	media.seedEntity(domain.MediaEntityVehicle, vin)
	media.seedEntityVIN(domain.MediaEntityIssue, "41", vin)
	media.seedEntityVIN(domain.MediaEntityIssue, "99", "N7V1K1SA9SK000002")
	uploader := usecase.NewMediaUploader(media, &fakeMediaStore{})

	jpg := tinyJPEG(t)
	ctx := context.Background()
	for _, in := range []usecase.UploadMediaInput{
		{EntityType: domain.MediaEntityVehicle, EntityID: vin, FileName: "v.jpg", MimeType: "image/jpeg", Content: bytes.NewReader(jpg), UploadedBy: 7},
		{EntityType: domain.MediaEntityIssue, EntityID: "41", FileName: "i.jpg", MimeType: "image/jpeg", Content: bytes.NewReader(jpg), UploadedBy: 7},
		{EntityType: domain.MediaEntityIssue, EntityID: "99", FileName: "other.jpg", MimeType: "image/jpeg", Content: bytes.NewReader(jpg), UploadedBy: 7},
	} {
		if _, err := uploader.Upload(ctx, in); err != nil {
			t.Fatalf("upload %s/%s: %v", in.EntityType, in.EntityID, err)
		}
	}

	attachments, err := uploader.ListByVIN(ctx, vin)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(attachments) != 2 {
		t.Fatalf("attachments = %d, want 2", len(attachments))
	}
	for _, a := range attachments {
		if a.VIN != vin {
			t.Errorf("vin = %q, want %q", a.VIN, vin)
		}
	}
}

func TestListMediaByVIN_UnknownVehicleNotFound(t *testing.T) {
	uploader := usecase.NewMediaUploader(newFakeMediaRepo(), &fakeMediaStore{})
	_, err := uploader.ListByVIN(context.Background(), "NOSUCHVIN00000000")
	if !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("err = %v, want domain.ErrNotFound", err)
	}
}
