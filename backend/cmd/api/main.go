// Package main is the HTTP API entrypoint for the Karea backend. It loads
// configuration, opens the database pool, and wires the repositories,
// usecases and auth issuer together. HTTP routing beyond /health is added in
// Prompt 4.
package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/karea/backend/internal/platform/auth"
	"github.com/karea/backend/internal/platform/config"
	"github.com/karea/backend/internal/repository/postgres"
	"github.com/karea/backend/internal/usecase"
)

// application holds the wired dependencies. It is the seam the Prompt 4 HTTP
// handlers will be built against.
type application struct {
	checkpoints *usecase.CheckpointResultRecorder
	checklists  *usecase.ChecklistResultRecorder
	vehicles    *usecase.VehicleSearcher
	issues      *usecase.IssueManager
	analysis    *usecase.AnalysisMetricsReader
	issuer      *auth.Issuer
}

func main() {
	cfg := config.Load()

	ctx := context.Background()
	pool, err := postgres.NewPool(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("failed to create database pool: %v", err)
	}
	defer pool.Close()

	vehicleRepo := postgres.NewVehicleRepo(pool)
	checkpointRepo := postgres.NewCheckpointProgressRepo(pool)
	checklistRepo := postgres.NewChecklistProgressRepo(pool)
	issueRepo := postgres.NewIssueRepo(pool)
	analysisRepo := postgres.NewAnalysisRepo(pool)

	app := &application{
		checkpoints: usecase.NewCheckpointResultRecorder(vehicleRepo, checkpointRepo),
		checklists:  usecase.NewChecklistResultRecorder(vehicleRepo, checklistRepo),
		vehicles:    usecase.NewVehicleSearcher(vehicleRepo),
		issues:      usecase.NewIssueManager(issueRepo),
		analysis:    usecase.NewAnalysisMetricsReader(analysisRepo),
		issuer:      auth.NewIssuer(cfg.JWTSecret, 24*time.Hour),
	}
	_ = app // handlers are wired in Prompt 4

	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})

	addr := fmt.Sprintf(":%s", cfg.Port)
	log.Printf("karea backend listening on %s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatal(err)
	}
}
