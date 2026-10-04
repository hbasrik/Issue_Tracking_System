package usecase

import (
	"strconv"
	"testing"

	"github.com/karea/backend/internal/domain"
)

func TestMovedPositions_OnlyDraggedItems(t *testing.T) {
	name := func(id int) domain.AdminAuditValue { return domain.AdminText("item " + strconv.Itoa(id)) }
	from := map[int]int{}
	for i := 1; i <= 10; i++ {
		from[i] = i
	}

	// Last item dragged to the top shifts the other nine down by one.
	got := movedPositions(from, []int{10, 1, 2, 3, 4, 5, 6, 7, 8, 9}, name)
	if len(got) != 1 || got[0].Subject.TR != "item 10" || got[0].From != 10 || got[0].To != 1 {
		t.Fatalf("drag to top = %+v", got)
	}

	// Two independent drags.
	got = movedPositions(from, []int{2, 3, 1, 4, 5, 6, 7, 10, 8, 9}, name)
	if len(got) != 2 || got[0].Subject.TR != "item 1" || got[1].Subject.TR != "item 10" {
		t.Fatalf("two drags = %+v", got)
	}

	if got = movedPositions(from, []int{1, 2, 3, 4, 5, 6, 7, 8, 9, 10}, name); len(got) != 0 {
		t.Fatalf("unchanged order = %+v", got)
	}
}
