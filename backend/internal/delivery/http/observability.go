package http

import (
	"fmt"
	"net/http"
	"runtime/debug"

	"github.com/go-chi/chi/v5/middleware"

	"github.com/karea/backend/internal/platform/applog"
)

// exposeRequestID copies chi's request id onto the response so clients and
// support can correlate "I got this error" with server logs.
func exposeRequestID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := middleware.GetReqID(r.Context())
		if id != "" {
			w.Header().Set("X-Request-ID", id)
		}
		next.ServeHTTP(w, r)
	})
}

// recoverPanic replaces chi's default Recoverer so panics become a JSON 500
// with request_id (no stack in the body) and a structured log line.
func recoverPanic(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			rec := recover()
			if rec == nil {
				return
			}
			reqID := middleware.GetReqID(r.Context())
			userID := 0
			if claims, ok := ClaimsFromContext(r.Context()); ok && claims != nil {
				userID = claims.UserID
			}
			applog.Error("panic recovered",
				"request_id", reqID,
				"method", r.Method,
				"path", r.URL.Path,
				"user_id", userID,
				"panic", fmt.Sprint(rec),
				"stack", string(debug.Stack()),
			)
			if w.Header().Get("X-Request-ID") == "" && reqID != "" {
				w.Header().Set("X-Request-ID", reqID)
			}
			writeJSON(w, http.StatusInternalServerError, errorResponse{
				Error:     "internal server error",
				RequestID: reqID,
			})
		}()
		next.ServeHTTP(w, r)
	})
}

// logServerErrors records every completed response with status >= 500.
// Panic recovery also logs; this catches writeError/default 500 paths.
func logServerErrors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
		next.ServeHTTP(ww, r)
		status := ww.Status()
		if status < 500 {
			return
		}
		reqID := middleware.GetReqID(r.Context())
		userID := 0
		if claims, ok := ClaimsFromContext(r.Context()); ok && claims != nil {
			userID = claims.UserID
		}
		applog.Error("http 5xx",
			"request_id", reqID,
			"method", r.Method,
			"path", r.URL.Path,
			"status", status,
			"user_id", userID,
			"bytes", ww.BytesWritten(),
		)
	})
}
