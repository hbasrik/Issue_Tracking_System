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
	"github.com/karea/backend/internal/platform/storage"
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
	stationStepRepo := postgres.NewStationStepProgressRepo(pool)
	checklistRepo := postgres.NewChecklistProgressRepo(pool)
	issueRepo := postgres.NewIssueRepo(pool)
	stationRepo := postgres.NewStationRepo(pool)
	analysisRepo := postgres.NewAnalysisRepo(pool)
	userRepo := postgres.NewUserRepo(pool)
	roleRepo := postgres.NewRoleRepo(pool)
	eolRepo := postgres.NewEOLWorkflowRepo(pool)
	mediaRepo := postgres.NewMediaRepo(pool)
	auditRepo := postgres.NewAuditRepo(pool)
	uow := postgres.NewUnitOfWork(pool)

	issuer := auth.NewIssuer(cfg.JWTSecret, 24*time.Hour)
	mediaStore := storage.NewLocalDisk(cfg.UploadDir)

	checklists := usecase.NewChecklistResultRecorder(vehicleRepo, checklistRepo, auditRepo, uow)
	router := deliveryhttp.NewRouter(deliveryhttp.Deps{
		Issuer:             issuer,
		Auth:               usecase.NewAuthenticator(userRepo),
		Roles:              roleRepo,
		Users:              usecase.NewUserAdmin(userRepo, roleRepo, cfg.AllowedEmailDomains),
		RoleAdmin:          usecase.NewRoleAdmin(roleRepo, userRepo),
		Vehicles:           usecase.NewVehicleService(vehicleRepo, checklistRepo, auditRepo, uow),
		StationSteps:       usecase.NewStationStepResultRecorder(vehicleRepo, stationStepRepo),
		Checklists:         checklists,
		Issues:             usecase.NewIssueManager(issueRepo, auditRepo, uow),
		Stations:           usecase.NewStationService(stationRepo),
		Analysis:           usecase.NewAnalysisMetricsReader(analysisRepo),
		EOLWorkflow:        usecase.NewEOLWorkflowReader(eolRepo),
		EOLBranchShip:      usecase.NewEOLBranchShipper(vehicleRepo, issueRepo, eolRepo, uow),
		EOLDepotRelease:    usecase.NewEOLDepotReleaser(vehicleRepo, issueRepo, eolRepo, uow),
		EOLDocumentApprove: usecase.NewEOLDocumentApprover(vehicleRepo, eolRepo, uow),
		EOLReset:           usecase.NewEOLWorkflowResetter(vehicleRepo, eolRepo, auditRepo, uow),
		ShipmentReadiness:  usecase.NewShipmentReadinessReader(vehicleRepo, checklists, issueRepo),
		Media:              usecase.NewMediaUploader(mediaRepo, mediaStore),
		CORSAllowedOrigins: cfg.CORSAllowedOrigins,
		AppEnv:             cfg.AppEnv,
		UploadDir:          cfg.UploadDir,
	})

	addr := ":" + cfg.Port
	log.Printf("karea backend listening on %s", addr)
	if err := http.ListenAndServe(addr, router); err != nil {
		log.Fatal(err)
	}
}
