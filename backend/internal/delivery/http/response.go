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
// blocked hard-block gate it also carries the offending checklist item IDs so
// the UI can list exactly what is blocking the transition (FR-3.7).
type errorResponse struct {
	Error           string `json:"error"`
	BlockingItemIDs []int  `json:"blocking_item_ids,omitempty"`
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
	switch {
	case errors.As(err, &gate):
		writeJSON(w, http.StatusConflict, errorResponse{
			Error:           gate.Error(),
			BlockingItemIDs: gate.BlockingItemIDs,
		})
	case errors.Is(err, domain.ErrNotFound):
		writeJSON(w, http.StatusNotFound, errorResponse{Error: err.Error()})
	case errors.Is(err, domain.ErrInvalidCredentials),
		errors.Is(err, auth.ErrInvalidToken),
		errors.Is(err, auth.ErrExpiredToken):
		writeJSON(w, http.StatusUnauthorized, errorResponse{Error: err.Error()})
	case errors.Is(err, domain.ErrForbidden),
		errors.Is(err, auth.ErrForbidden):
		writeJSON(w, http.StatusForbidden, errorResponse{Error: err.Error()})
	case errors.Is(err, domain.ErrInvalidStatusTransition):
		writeJSON(w, http.StatusConflict, errorResponse{Error: err.Error()})
	case errors.Is(err, domain.ErrDescriptionRequired),
		errors.Is(err, domain.ErrSeverityRequired),
		errors.Is(err, domain.ErrInvalidEnumValue):
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
