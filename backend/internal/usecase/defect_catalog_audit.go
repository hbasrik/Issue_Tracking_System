package usecase

import (
	"context"
	"errors"
	"strconv"

	"github.com/karea/backend/internal/domain"
)

// catalogSnapshot is one catalogue row as the audit sees it: readable names,
// never bare ids. Zone is set for parts, Process for defect types.
type catalogSnapshot struct {
	Code    string
	NameTR  string
	NameEN  string
	Active  bool
	Sort    int
	Zone    domain.AdminAuditValue
	Process domain.AdminAuditValue
}

func (s catalogSnapshot) subject() domain.AdminAuditValue {
	return domain.AdminNames(s.Code, s.NameTR, s.NameEN)
}

func processSnapshot(p *domain.DefectProcess) catalogSnapshot {
	return catalogSnapshot{Code: p.Code, NameTR: p.NameTR, NameEN: p.NameEN, Active: p.IsActive, Sort: p.SortOrder}
}

func zoneSnapshot(z *domain.DefectZone) catalogSnapshot {
	return catalogSnapshot{Code: z.Code, NameTR: z.NameTR, NameEN: z.NameEN, Active: z.IsActive, Sort: z.SortOrder}
}

func zoneValue(z *domain.DefectZone) domain.AdminAuditValue {
	if z == nil {
		return domain.AdminAuditValue{}
	}
	return domain.AdminNames(z.Code, z.NameTR, z.NameEN)
}

func partSnapshot(p *domain.DefectPart, zone *domain.DefectZone) catalogSnapshot {
	return catalogSnapshot{
		Code: p.Code, NameTR: p.NameTR, NameEN: p.NameEN, Active: p.IsActive, Sort: p.SortOrder,
		Zone: zoneValue(zone),
	}
}

func typeSnapshot(t *domain.DefectType, process domain.AdminAuditValue) catalogSnapshot {
	return catalogSnapshot{
		Code: t.Code, NameTR: t.NameTR, NameEN: t.NameEN, Active: t.IsActive, Sort: t.SortOrder,
		Process: process,
	}
}

// processValue resolves a default process id to its names; nil is "none".
func (a *DefectCatalogAdmin) processValue(ctx context.Context, id *int) (domain.AdminAuditValue, error) {
	if id == nil {
		return domain.AdminAuditValue{}, nil
	}
	p, err := a.catalog.GetProcess(ctx, *id)
	if errors.Is(err, domain.ErrNotFound) {
		return domain.AdminAuditValue{}, nil
	}
	if err != nil {
		return domain.AdminAuditValue{}, err
	}
	return domain.AdminNames(p.Code, p.NameTR, p.NameEN), nil
}

// catalogDetail builds the audit detail for a create (from nil), update or
// delete (to nil). The sort order is listed only for updates.
func catalogDetail(entity string, id int, from, to *catalogSnapshot) domain.AdminAuditDetail {
	d := domain.AdminAuditDetail{Entity: entity, EntityID: id}
	var f, t catalogSnapshot
	switch {
	case from == nil:
		d.Action = domain.AdminActionCreate
		d.Subject = to.subject()
		t = *to
	case to == nil:
		d.Action = domain.AdminActionDelete
		d.Subject = from.subject()
		f = *from
	default:
		d.Action = domain.AdminActionUpdate
		d.Subject = from.subject()
		f, t = *from, *to
	}
	names := func(s catalogSnapshot) domain.AdminAuditValue {
		return domain.AdminAuditValue{TR: s.NameTR, EN: s.NameEN}
	}
	code := func(s catalogSnapshot) domain.AdminAuditValue { return domain.AdminAuditValue{Code: s.Code} }
	active := func(s *catalogSnapshot) domain.AdminAuditValue {
		if s == nil {
			return domain.AdminAuditValue{}
		}
		return domain.AdminBool(s.Active)
	}
	d.AddChange(domain.AdminFieldName, names(f), names(t))
	d.AddChange(domain.AdminFieldCode, code(f), code(t))
	d.AddChange(domain.AdminFieldZone, f.Zone, t.Zone)
	d.AddChange(domain.AdminFieldDefaultProcess, f.Process, t.Process)
	d.AddChange(domain.AdminFieldActive, active(from), active(to))
	if from != nil && to != nil {
		d.AddChange(domain.AdminFieldSortOrder,
			domain.AdminAuditValue{Code: strconv.Itoa(f.Sort)},
			domain.AdminAuditValue{Code: strconv.Itoa(t.Sort)})
		d.Action = activeAction(&d, f.Active, t.Active)
	}
	if !t.Zone.IsZero() {
		d.Parent = t.Zone
	} else if !f.Zone.IsZero() {
		d.Parent = f.Zone
	}
	return d
}

// writeCatalog runs fn and records d in one transaction; an update that
// changed nothing writes no row.
func (a *DefectCatalogAdmin) writeCatalog(ctx context.Context, actorID int, d domain.AdminAuditDetail, fn func(context.Context) error) error {
	aud := adminAuditor{audit: a.audit, uow: a.uow}
	return aud.withTx(ctx, func(txCtx context.Context) error {
		if err := fn(txCtx); err != nil {
			return err
		}
		if d.Action == domain.AdminActionUpdate && len(d.Changes) == 0 {
			return nil
		}
		return aud.record(txCtx, domain.AuditEventDefectCatalog, actorID, d)
	})
}

// reorderDetail lists the rows whose rank changed; before is in current
// display order.
func reorderDetail(entity string, parent domain.AdminAuditValue, before []catalogRank, after []int) domain.AdminAuditDetail {
	fromPos := make(map[int]int, len(before))
	subjects := make(map[int]domain.AdminAuditValue, len(before))
	for i, r := range before {
		fromPos[r.ID] = i + 1
		subjects[r.ID] = r.Subject
	}
	return domain.AdminAuditDetail{
		Action: domain.AdminActionReorder,
		Entity: entity,
		Parent: parent,
		Moved:  movedPositions(fromPos, after, func(id int) domain.AdminAuditValue { return subjects[id] }),
	}
}

type catalogRank struct {
	ID      int
	Subject domain.AdminAuditValue
}

func (a *DefectCatalogAdmin) writeReorder(ctx context.Context, actorID int, d domain.AdminAuditDetail, fn func(context.Context) error) error {
	aud := adminAuditor{audit: a.audit, uow: a.uow}
	return aud.withTx(ctx, func(txCtx context.Context) error {
		if err := fn(txCtx); err != nil {
			return err
		}
		if len(d.Moved) == 0 {
			return nil
		}
		return aud.record(txCtx, domain.AuditEventDefectCatalog, actorID, d)
	})
}
