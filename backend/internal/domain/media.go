package domain

import (
	"strconv"
	"time"
)

// MediaEntityType enumerates what a media attachment can hang off. Karar 8
// replaces per-table *_url columns with one polymorphic media_attachments
// table, so this set is the application's substitute for the foreign key the
// database deliberately cannot declare.
type MediaEntityType string

const (
	MediaEntityVehicle               MediaEntityType = "VEHICLE"
	MediaEntityIssue                 MediaEntityType = "ISSUE"
	MediaEntityIssueResolution       MediaEntityType = "ISSUE_RESOLUTION"
	MediaEntityChecklistItemProgress MediaEntityType = "CHECKLIST_ITEM_PROGRESS"
	MediaEntityStationStepProgress   MediaEntityType = "STATION_STEP_PROGRESS"
)

// Valid reports whether the entity type is one this application recognises.
func (t MediaEntityType) Valid() bool {
	switch t {
	case MediaEntityVehicle, MediaEntityIssue, MediaEntityIssueResolution,
		MediaEntityChecklistItemProgress, MediaEntityStationStepProgress:
		return true
	default:
		return false
	}
}

// ValidateEntityID checks that the id is well-formed for the entity type
// before it is used in a lookup. entity_id is TEXT because a vehicle is keyed
// by VIN while everything else is keyed by a numeric id; without this check a
// non-numeric id would reach the database as a failed cast rather than a clean
// client error.
func (t MediaEntityType) ValidateEntityID(entityID string) error {
	if !t.Valid() {
		return ErrInvalidEnumValue
	}
	if entityID == "" {
		return ErrInvalidEnumValue
	}
	if t == MediaEntityVehicle {
		return nil
	}
	if _, err := strconv.ParseInt(entityID, 10, 64); err != nil {
		return ErrInvalidEnumValue
	}
	return nil
}

// MediaAttachment mirrors the media_attachments table.
type MediaAttachment struct {
	ID          int64           `json:"id"`
	EntityType  MediaEntityType `json:"entity_type"`
	EntityID    string          `json:"entity_id"`
	VIN         string          `json:"vin"`
	FileName    string          `json:"file_name"`
	StoragePath string          `json:"storage_path"`
	MimeType    string          `json:"mime_type"`
	FileSize    int64           `json:"file_size"`
	UploadedBy  *int            `json:"uploaded_by"`
	UploadedAt  time.Time       `json:"uploaded_at"`
}
