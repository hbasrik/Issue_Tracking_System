package usecase_test

import (
	"testing"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/usecase"
)

func TestEvaluateChecklistGate_MissingActiveItemBlocks(t *testing.T) {
	pid := int64(10)
	items := []domain.ChecklistItemView{
		{ItemID: 1, Status: domain.CheckStatusOK, ProgressID: &pid, IsActive: true},
		{ItemID: 2, Status: domain.CheckStatusPending, ProgressID: nil, IsActive: true},
		{ItemID: 99, Status: domain.CheckStatusPending, ProgressID: nil, IsActive: false},
	}
	open, blocking, missing := usecase.EvaluateChecklistGate(items)
	if open {
		t.Fatal("expected gate closed")
	}
	if len(blocking) != 0 {
		t.Fatalf("blocking=%v", blocking)
	}
	if len(missing) != 1 || missing[0] != 2 {
		t.Fatalf("missing=%v, want [2]", missing)
	}
}

func TestEvaluateChecklistGate_InactiveIgnored(t *testing.T) {
	items := []domain.ChecklistItemView{
		{ItemID: 99, Status: domain.CheckStatusPending, ProgressID: nil, IsActive: false},
	}
	open, blocking, missing := usecase.EvaluateChecklistGate(items)
	if !open || len(blocking) != 0 || len(missing) != 0 {
		t.Fatalf("open=%v blocking=%v missing=%v", open, blocking, missing)
	}
}
