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

// movedPositions lists the subjects whose position (fromPos) differs from
// their 1-based index in the new order.
func movedPositions(fromPos map[int]int, after []int, subject func(id int) domain.AdminAuditValue) []domain.AdminAuditMove {
	var out []domain.AdminAuditMove
	for i, id := range after {
		from, ok := fromPos[id]
		if !ok || from == i+1 {
			continue
		}
		out = append(out, domain.AdminAuditMove{Subject: subject(id), From: from, To: i + 1})
	}
	return out
}

func sortValuesByCode(v []domain.AdminAuditValue) {
	sort.Slice(v, func(i, j int) bool { return v[i].Code < v[j].Code })
}
