package usecase_test

import (
	"context"
	"testing"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/usecase"
)

func TestBulkImportPlannedSkipsDuplicatesAndInvalid(t *testing.T) {
	t.Parallel()
	vehicles := newFakeVehicleRepo()
	vehicles.vehicles["N7V1K1SA0PLN00001"] = &domain.Vehicle{
		VIN:                 "N7V1K1SA0PLN00001",
		CurrentGlobalStatus: domain.VehicleStatusInProduction,
	}
	svc := usecase.NewVehicleService(vehicles, newFakeChecklistRepo(), newFakeAuditRepo(), &passthroughFakeUoW{})

	res, err := svc.BulkImportPlanned(context.Background(), []string{
		"n7v1k1sa0pln00001",
		"N7V1K1SA0PLN00002",
		"N7V1K1SA0PLN00002",
		"short",
		"N7V1K1SA0PLN00003",
	})
	if err != nil {
		t.Fatalf("BulkImportPlanned: %v", err)
	}
	if len(res.Created) != 2 {
		t.Fatalf("created = %v, want 2 new VINs", res.Created)
	}
	if len(res.Skipped) != 1 || res.Skipped[0] != "N7V1K1SA0PLN00001" {
		t.Fatalf("skipped = %v, want existing VIN", res.Skipped)
	}
	if len(res.Invalid) != 1 || res.Invalid[0] != "short" {
		t.Fatalf("invalid = %v, want short", res.Invalid)
	}
	got := vehicles.vehicles["N7V1K1SA0PLN00002"]
	if got == nil || got.CurrentGlobalStatus != domain.VehicleStatusPlanned {
		t.Fatalf("new VIN status = %+v, want PLANNED", got)
	}
}
