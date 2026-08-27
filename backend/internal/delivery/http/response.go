package http

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/platform/auth"
)

// errorResponse is the uniform error envelope returned to clients. For a
// blocked hard-block gate it also carries what is blocking the transition so
// the UI can list it (FR-3.7): checklist item IDs for the shipment gate, or
// the open issues for the EOL depot-release gate.
type errorResponse struct {
	Error           string                 `json:"error"`
	BlockingItemIDs []int                  `json:"blocking_item_ids,omitempty"`
	BlockingIssues  []domain.BlockingIssue `json:"blocking_issues,omitempty"`
}

// writeJSON serializes v as JSON with the given status code.
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if v == nil {
		return
	}
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("http: failed to encode response: %v", err)
	}
}

// writeError maps a domain/auth error to an HTTP status code and JSON body.
// This is the single place transport concerns meet domain errors.
func writeError(w http.ResponseWriter, err error) {
	var gate *domain.GateBlockedError
	var depot *domain.DepotReleaseBlockedError
	var rejected *domain.DatabaseRejectedError
	var itemInUse *domain.TemplateItemInUseError
	var emailDomain *domain.EmailDomainNotAllowedError
	var userInUse *domain.UserInUseError
	switch {
	case errors.As(err, &gate):
		writeJSON(w, http.StatusConflict, errorResponse{
			Error:           gate.Error(),
			BlockingItemIDs: gate.BlockingItemIDs,
		})
	case errors.As(err, &depot):
		writeJSON(w, http.StatusConflict, errorResponse{
			Error:          depot.Error(),
			BlockingIssues: depot.BlockingIssues,
		})
	case errors.As(err, &rejected):
		writeJSON(w, http.StatusConflict, errorResponse{Error: rejected.Error()})
	case errors.As(err, &itemInUse):
		writeJSON(w, http.StatusConflict, errorResponse{Error: itemInUse.Error()})
	case errors.As(err, &userInUse):
		writeJSON(w, http.StatusConflict, errorResponse{Error: userInUse.Error()})
	case errors.As(err, &emailDomain):
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: emailDomain.Error()})
	case errors.Is(err, domain.ErrDepotChecklistLocked),
		errors.Is(err, domain.ErrInvalidStatusTransition),
		errors.Is(err, domain.ErrLastActiveManager),
		errors.Is(err, domain.ErrEmailTaken):
		writeJSON(w, http.StatusConflict, errorResponse{Error: err.Error()})
	case errors.Is(err, domain.ErrNotFound):
		writeJSON(w, http.StatusNotFound, errorResponse{Error: err.Error()})
	case errors.Is(err, domain.ErrInvalidCredentials),
		errors.Is(err, auth.ErrInvalidToken),
		errors.Is(err, auth.ErrExpiredToken):
		writeJSON(w, http.StatusUnauthorized, errorResponse{Error: err.Error()})
	case errors.Is(err, domain.ErrAccountInactive),
		errors.Is(err, domain.ErrCannotChangeOwnRole),
		errors.Is(err, domain.ErrCannotDeactivateSelf),
		errors.Is(err, domain.ErrCannotResetOwnPassword),
		errors.Is(err, domain.ErrCannotDeleteSelf),
		errors.Is(err, domain.ErrMustChangePassword),
		errors.Is(err, domain.ErrForbidden),
		errors.Is(err, auth.ErrForbidden):
		writeJSON(w, http.StatusForbidden, errorResponse{Error: err.Error()})
	case errors.Is(err, domain.ErrDescriptionRequired),
		errors.Is(err, domain.ErrIssueDescriptionRequired),
		errors.Is(err, domain.ErrSolutionDescriptionRequired),
		errors.Is(err, domain.ErrSeverityRequired),
		errors.Is(err, domain.ErrVINRequired),
		errors.Is(err, domain.ErrStationRequired),
		errors.Is(err, domain.ErrIssueTypeRequired),
		errors.Is(err, domain.ErrInvalidManualSource),
		errors.Is(err, domain.ErrInvalidEnumValue),
		errors.Is(err, domain.ErrUnsupportedImageFormat),
		errors.Is(err, domain.ErrTemplateItemTextRequired),
		errors.Is(err, domain.ErrTemplateItemTextTooLong),
		errors.Is(err, domain.ErrEOLPhaseRequired),
		errors.Is(err, domain.ErrEOLPhaseNotAllowed),
		errors.Is(err, domain.ErrTemplateItemReorderInvalid),
		errors.Is(err, domain.ErrFullNameRequired),
		errors.Is(err, domain.ErrEmailRequired),
		errors.Is(err, domain.ErrPasswordTooShort),
		errors.Is(err, domain.ErrPasswordTooWeak),
		errors.Is(err, domain.ErrPasswordMismatch),
		errors.Is(err, domain.ErrEmailInvalid):
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: err.Error()})
	default:
		log.Printf("http: unhandled error: %v", err)
		writeJSON(w, http.StatusInternalServerError, errorResponse{Error: "internal server error"})
	}
}

// badRequest writes a 400 with a plain message (used for malformed input that
// never reached the usecase layer).
func badRequest(w http.ResponseWriter, message string) {
	writeJSON(w, http.StatusBadRequest, errorResponse{Error: message})
}

// decodeJSON decodes a JSON request body into dst, rejecting unknown fields.
func decodeJSON(r *http.Request, dst any) error {
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	return dec.Decode(dst)
}
