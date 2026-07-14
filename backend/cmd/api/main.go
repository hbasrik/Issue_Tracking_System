// Package main is the HTTP API entrypoint for the Karea backend. It loads
// configuration, opens the database pool, wires the repositories, usecases and
// auth issuer together, and serves the HTTP API.
package main

import (
	"context"
	"log"
	"net/http"
	"time"

	deliveryhttp "github.com/karea/backend/internal/delivery/http"
	"github.com/karea/backend/internal/platform/auth"
	"github.com/karea/backend/internal/platform/config"
	"github.com/karea/backend/internal/repository/postgres"
	"github.com/karea/backend/internal/usecase"
)

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
	stationRepo := postgres.NewStationRepo(pool)
	analysisRepo := postgres.NewAnalysisRepo(pool)
	userRepo := postgres.NewUserRepo(pool)
	auditRepo := postgres.NewAuditRepo(pool)
	uow := postgres.NewUnitOfWork(pool)

	issuer := auth.NewIssuer(cfg.JWTSecret, 24*time.Hour)

	router := deliveryhttp.NewRouter(deliveryhttp.Deps{
		Issuer:             issuer,
		Auth:               usecase.NewAuthenticator(userRepo),
		Vehicles:           usecase.NewVehicleService(vehicleRepo, checklistRepo, auditRepo, uow),
		Checkpoints:        usecase.NewCheckpointResultRecorder(vehicleRepo, checkpointRepo),
		Checklists:         usecase.NewChecklistResultRecorder(vehicleRepo, checklistRepo),
		Issues:             usecase.NewIssueManager(issueRepo, auditRepo, uow),
		Stations:           usecase.NewStationService(stationRepo),
		Analysis:           usecase.NewAnalysisMetricsReader(analysisRepo),
		CORSAllowedOrigins: cfg.CORSAllowedOrigins,
	})

	addr := ":" + cfg.Port
	log.Printf("karea backend listening on %s", addr)
	if err := http.ListenAndServe(addr, router); err != nil {
		log.Fatal(err)
	}
}
