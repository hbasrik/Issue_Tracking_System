package http

import (
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/platform/auth"
	"github.com/karea/backend/internal/usecase"
)

// maxUploadMemory is how much of a multipart upload is buffered in memory
// before the rest spills to a temp file.
const maxUploadMemory = 10 << 20 // 10 MiB

// handleMediaUpload accepts a multipart upload (entity_type, entity_id, file)
// and attaches it to the named entity (Karar 8). Write access is checked per
// target entity — vehicle.view alone is not enough.
func (s *server) handleMediaUpload(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(maxUploadMemory); err != nil {
		badRequest(w, "request must be multipart/form-data")
		return
	}

	entityType, entityID, ok := parseMediaEntity(w, r.FormValue("entity_type"), r.FormValue("entity_id"))
	if !ok {
		return
	}
	if !s.requireMediaWriteAccess(w, r, entityType, entityID) {
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		badRequest(w, "file is required")
		return
	}
	defer file.Close()

	claims, _ := ClaimsFromContext(r.Context())
	attachment, err := s.deps.Media.Upload(r.Context(), usecase.UploadMediaInput{
		EntityType: entityType,
		EntityID:   entityID,
		FileName:   header.Filename,
		MimeType:   header.Header.Get("Content-Type"),
		Content:    file,
		UploadedBy: claims.UserID,
	})
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, attachment)
}

// requireMediaWriteAccess gates POST /media by the target entity's write permission.
func (s *server) requireMediaWriteAccess(w http.ResponseWriter, r *http.Request, entityType domain.MediaEntityType, entityID string) bool {
	switch entityType {
	case domain.MediaEntityVehicle:
		return s.requireCode(w, r, domain.PermissionAdminManageMasters)
	case domain.MediaEntityIssue:
		return s.requireAnyCode(w, r,
			domain.PermissionIssueCreate,
			domain.PermissionIssueTransitionProgress,
			domain.PermissionIssueTransitionApprove,
			domain.PermissionIssueTransitionConditionalApprove,
			domain.PermissionAdminManageMasters,
		)
	case domain.MediaEntityIssueResolution:
		return s.requireAnyCode(w, r,
			domain.PermissionIssueTransitionProgress,
			domain.PermissionIssueTransitionApprove,
			domain.PermissionIssueTransitionConditionalApprove,
		)
	case domain.MediaEntityStationStepProgress:
		return s.requireCode(w, r, domain.PermissionStationStepEdit)
	case domain.MediaEntityChecklistItemProgress:
		if s.deps.Media == nil {
			writeError(w, auth.ErrForbidden)
			return false
		}
		ct, err := s.deps.Media.ChecklistTypeForProgressID(r.Context(), entityID)
		if err != nil {
			writeError(w, err)
			return false
		}
		return s.requireCode(w, r, domain.ChecklistEditPermission(ct))
	default:
		writeError(w, auth.ErrForbidden)
		return false
	}
}

func (s *server) requireAnyCode(w http.ResponseWriter, r *http.Request, codes ...string) bool {
	_, permissions, err := s.permissions.Resolve(r.Context())
	if err != nil {
		writeError(w, err)
		return false
	}
	for _, code := range codes {
		if auth.Authorize(permissions, code) == nil {
			return true
		}
	}
	writeError(w, auth.ErrForbidden)
	return false
}

// handleMediaList returns an entity's attachments for the Vehicle Detail and
// Issue Detail screens. An entity with nothing attached yields an empty items
// array.
func (s *server) handleMediaList(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	entityType, entityID, ok := parseMediaEntity(w, q.Get("entity_type"), q.Get("entity_id"))
	if !ok {
		return
	}

	attachments, err := s.deps.Media.ListForEntity(r.Context(), entityType, entityID)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": attachments})
}

// handleVehicleMediaList returns every attachment for one VIN (Karar 11), used
// by Vehicle Detail "all photos". An unknown VIN is 404; a known vehicle with
// no photos yields items: [].
func (s *server) handleVehicleMediaList(w http.ResponseWriter, r *http.Request) {
	vin := chi.URLParam(r, "vin")
	attachments, err := s.deps.Media.ListByVIN(r.Context(), vin)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": attachments})
}

// parseMediaEntity validates the entity_type/entity_id pair shared by both
// media endpoints, writing the 400 itself and reporting whether the caller
// should continue.
func parseMediaEntity(w http.ResponseWriter, rawType, rawID string) (domain.MediaEntityType, string, bool) {
	entityType := domain.MediaEntityType(strings.ToUpper(strings.TrimSpace(rawType)))
	if !entityType.Valid() {
		badRequest(w, "entity_type must be one of: VEHICLE, ISSUE, ISSUE_RESOLUTION, CHECKLIST_ITEM_PROGRESS, STATION_STEP_PROGRESS")
		return "", "", false
	}

	entityID := strings.TrimSpace(rawID)
	if err := entityType.ValidateEntityID(entityID); err != nil {
		if entityType == domain.MediaEntityVehicle {
			badRequest(w, "entity_id is required and must be a VIN for entity_type VEHICLE")
		} else {
			badRequest(w, "entity_id is required and must be an integer id for entity_type "+string(entityType))
		}
		return "", "", false
	}
	return entityType, entityID, true
}
