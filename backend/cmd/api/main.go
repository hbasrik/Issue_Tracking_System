// Package main is the HTTP API entrypoint for the Karea backend. It loads
// configuration, opens the database pool, wires the repositories, usecases and
// auth issuer together, and serves the HTTP API.
package main

import (
	"context"
	"log"
	"net/http"
	"strings"
	"time"

	deliveryhttp "github.com/karea/backend/internal/delivery/http"
	"github.com/karea/backend/internal/platform/applog"
	"github.com/karea/backend/internal/platform/auth"
	"github.com/karea/backend/internal/platform/config"
	"github.com/karea/backend/internal/platform/storage"
	"github.com/karea/backend/internal/repository/postgres"
	"github.com/karea/backend/internal/usecase"
)

func main() {
	cfg := config.Load()
	if err := applog.Init(applog.Options{
		Level:      applog.ParseLevel(cfg.LogLevel),
		FilePath:   cfg.LogFile,
		MaxBytes:   cfg.LogMaxBytes,
		MaxBackups: cfg.LogMaxBackups,
	}); err != nil {
		log.Fatalf("failed to init logger: %v", err)
	}
	defer applog.Close()

	ctx := context.Background()
	pool, err := postgres.NewPool(ctx, cfg.DatabaseURL, cfg.AppEnv)
	if err != nil {
		applog.Error("database pool failed", "error", err.Error())
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
	defectCatalogRepo := postgres.NewDefectCatalogRepo(pool)
	uow := postgres.NewUnitOfWork(pool)
	loginLimiter := usecase.NewLoginLimiter(auditRepo)

	issuer := auth.NewIssuer(cfg.JWTSecret, 24*time.Hour)
	mediaStore := storage.NewLocalDisk(cfg.UploadDir)

	checklists := usecase.NewChecklistResultRecorder(vehicleRepo, checklistRepo, auditRepo, uow)
	var eolReset *usecase.EOLWorkflowResetter
	if strings.EqualFold(strings.TrimSpace(cfg.AppEnv), "development") {
		// Production/staging binaries never construct this usecase, so they
		// cannot invoke fn_ops_set_vehicle_status through the API layer.
		eolReset = usecase.NewEOLWorkflowResetter(vehicleRepo, eolRepo, auditRepo, uow)
	}
	router := deliveryhttp.NewRouter(deliveryhttp.Deps{
		Issuer:             issuer,
		Auth:               usecase.NewAuthenticator(userRepo),
		Roles:              roleRepo,
		Users:              usecase.NewUserAdmin(userRepo, roleRepo, cfg.AllowedEmailDomains),
		RoleAdmin:          usecase.NewRoleAdmin(roleRepo, userRepo),
		Vehicles:           usecase.NewVehicleService(vehicleRepo, checklistRepo, auditRepo, uow),
		StationSteps:       usecase.NewStationStepResultRecorder(vehicleRepo, stationStepRepo),
		Checklists:         checklists,
		Issues:             usecase.NewIssueManager(issueRepo, auditRepo, uow, vehicleRepo, defectCatalogRepo),
		Stations:           usecase.NewStationService(stationRepo),
		Analysis:           usecase.NewAnalysisMetricsReader(analysisRepo),
		Home:               usecase.NewHomeOverviewReader(analysisRepo, auditRepo),
		Activity:           usecase.NewActivityReader(auditRepo),
		EOLWorkflow:        usecase.NewEOLWorkflowReader(eolRepo, issueRepo, checklists, checklistRepo, stationStepRepo),
		EOLBranchShip:      usecase.NewEOLBranchShipper(vehicleRepo, issueRepo, eolRepo, checklists, checklistRepo, stationStepRepo, uow),
		EOLDepotRelease:    usecase.NewEOLDepotReleaser(vehicleRepo, issueRepo, eolRepo, checklists, uow),
		EOLDeliver:         usecase.NewEOLDeliverer(vehicleRepo, eolRepo, uow),
		EOLDocumentApprove: usecase.NewEOLDocumentApprover(vehicleRepo, eolRepo, uow),
		EOLReset:           eolReset,
		ShipmentReadiness:  usecase.NewShipmentReadinessReader(vehicleRepo, checklists, issueRepo),
		Media:              usecase.NewMediaUploader(mediaRepo, mediaStore),
		DefectCatalog:      usecase.NewDefectCatalogAdmin(defectCatalogRepo, issueRepo, auditRepo, uow),
		LoginLimiter:       loginLimiter,
		CORSAllowedOrigins: cfg.CORSAllowedOrigins,
		AppEnv:             cfg.AppEnv,
		UploadDir:          cfg.UploadDir,
	})

	addr := ":" + cfg.Port
	applog.Info("karea backend listening", "addr", addr, "log_file", cfg.LogFile, "log_level", cfg.LogLevel)
	if err := http.ListenAndServe(addr, router); err != nil {
		applog.Error("http server stopped", "error", err.Error())
		log.Fatal(err)
	}
}
