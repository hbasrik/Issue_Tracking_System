package usecase

import (
	"context"
	"sort"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/repository"
)

// adminAuditor writes management audit rows (Karar 25) in the same
// transaction as the change they describe. A nil audit repository (unit
// tests) records nothing; a nil uow runs without a transaction.
type adminAuditor struct {
	audit repository.AuditRepository
	uow   repository.TransactionManager
}

func (a adminAuditor) withTx(ctx context.Context, fn func(context.Context) error) error {
	if a.uow == nil {
		return fn(ctx)
	}
	return a.uow.WithinTx(ctx, fn)
}

func (a adminAuditor) record(ctx context.Context, event domain.AuditEvent, actorID int, d domain.AdminAuditDetail) error {
	if a.audit == nil {
		return nil
	}
	var by *int
	if actorID > 0 {
		id := actorID
		by = &id
	}
	return a.audit.Append(ctx, domain.AuditLog{
		EventType:   event,
		PerformedBy: by,
		Metadata:    d.Metadata(),
	})
}

// activeAction names an edit that only flipped the active flag; any other
// edit is an update.
func activeAction(d *domain.AdminAuditDetail, wasActive, isActive bool) string {
	if len(d.Changes) == 1 && d.Changes[0].Field == domain.AdminFieldActive {
		if isActive && !wasActive {
			return domain.AdminActionActivate
		}
		return domain.AdminActionDeactivate
	}
	return domain.AdminActionUpdate
}

func roleValue(r domain.Role) domain.AdminAuditValue {
	return domain.AdminAuditValue{Code: r.Code, TR: r.Name, EN: r.Name}
}

func permissionValue(p domain.Permission) domain.AdminAuditValue {
	return domain.AdminAuditValue{Code: p.Code, TR: p.Description, EN: p.Description}
}

// movedPositions lists the subjects that were actually dragged: everything
// outside the longest run that kept its relative order. Dragging one item
// across a list shifts all rows in between, and those are not listed.
func movedPositions(fromPos map[int]int, after []int, subject func(id int) domain.AdminAuditValue) []domain.AdminAuditMove {
	ids := make([]int, 0, len(after))
	to := make(map[int]int, len(after))
	for i, id := range after {
		if _, ok := fromPos[id]; ok {
			ids = append(ids, id)
			to[id] = i + 1
		}
	}
	kept := longestIncreasing(ids, fromPos)
	var out []domain.AdminAuditMove
	for _, id := range ids {
		if kept[id] {
			continue
		}
		out = append(out, domain.AdminAuditMove{Subject: subject(id), From: fromPos[id], To: to[id]})
	}
	return out
}

// longestIncreasing marks one longest subsequence of ids whose fromPos values
// increase (patience sorting, O(n log n)).
func longestIncreasing(ids []int, fromPos map[int]int) map[int]bool {
	tails := []int{}
	prev := make([]int, len(ids))
	for i, id := range ids {
		v := fromPos[id]
		k := sort.Search(len(tails), func(j int) bool { return fromPos[ids[tails[j]]] >= v })
		if k > 0 {
			prev[i] = tails[k-1]
		} else {
			prev[i] = -1
		}
		if k == len(tails) {
			tails = append(tails, i)
		} else {
			tails[k] = i
		}
	}
	kept := make(map[int]bool, len(tails))
	if len(tails) == 0 {
		return kept
	}
	for i := tails[len(tails)-1]; i >= 0; i = prev[i] {
		kept[ids[i]] = true
	}
	return kept
}

func sortValuesByCode(v []domain.AdminAuditValue) {
	sort.Slice(v, func(i, j int) bool { return v[i].Code < v[j].Code })
}
