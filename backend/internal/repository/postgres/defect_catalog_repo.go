package postgres

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/repository"
)

// DefectCatalogRepo persists the defect classification masters.
type DefectCatalogRepo struct {
	pool *pgxpool.Pool
}

// NewDefectCatalogRepo constructs a DefectCatalogRepo.
func NewDefectCatalogRepo(pool *pgxpool.Pool) *DefectCatalogRepo {
	return &DefectCatalogRepo{pool: pool}
}

var _ repository.DefectCatalogRepository = (*DefectCatalogRepo)(nil)

func mapUniqueViolation(err error) error {
	if IsUniqueViolation(err) {
		return domain.ErrDefectCatalogueCodeTaken
	}
	return err
}

// --- Processes ---

func (r *DefectCatalogRepo) ListProcesses(ctx context.Context) ([]domain.DefectProcess, error) {
	rows, err := executor(ctx, r.pool).Query(ctx, `
		SELECT p.id, p.code, p.name_tr, p.name_en, p.sort_order, p.is_active, p.created_at, p.updated_at,
		       (SELECT COUNT(*)::int FROM issue_list i WHERE i.responsible_process_id = p.id)
		     + (SELECT COUNT(*)::int FROM defect_types t WHERE t.default_process_id = p.id) AS usage_count
		FROM defect_processes p
		ORDER BY p.sort_order, p.id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.DefectProcess
	for rows.Next() {
		var p domain.DefectProcess
		if err := rows.Scan(&p.ID, &p.Code, &p.NameTR, &p.NameEN, &p.SortOrder, &p.IsActive, &p.CreatedAt, &p.UpdatedAt, &p.UsageCount); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (r *DefectCatalogRepo) CreateProcess(ctx context.Context, p *domain.DefectProcess) (int, error) {
	var id int
	err := executor(ctx, r.pool).QueryRow(ctx, `
		INSERT INTO defect_processes (code, name_tr, name_en, sort_order, is_active)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id`,
		strings.TrimSpace(p.Code), strings.TrimSpace(p.NameTR), strings.TrimSpace(p.NameEN), p.SortOrder, p.IsActive,
	).Scan(&id)
	return id, mapUniqueViolation(err)
}

func (r *DefectCatalogRepo) UpdateProcess(ctx context.Context, p *domain.DefectProcess) error {
	tag, err := executor(ctx, r.pool).Exec(ctx, `
		UPDATE defect_processes
		SET code = $2, name_tr = $3, name_en = $4, sort_order = $5, is_active = $6, updated_at = now()
		WHERE id = $1`,
		p.ID, strings.TrimSpace(p.Code), strings.TrimSpace(p.NameTR), strings.TrimSpace(p.NameEN), p.SortOrder, p.IsActive,
	)
	if err != nil {
		return mapUniqueViolation(err)
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrNotFound
	}
	return nil
}

func (r *DefectCatalogRepo) DeleteProcess(ctx context.Context, id int) error {
	tag, err := executor(ctx, r.pool).Exec(ctx, `DELETE FROM defect_processes WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrNotFound
	}
	return nil
}

func (r *DefectCatalogRepo) CountProcessUsage(ctx context.Context, id int) (int, error) {
	var n int
	err := executor(ctx, r.pool).QueryRow(ctx, `
		SELECT
		  (SELECT COUNT(*)::int FROM issue_list WHERE responsible_process_id = $1)
		+ (SELECT COUNT(*)::int FROM defect_types WHERE default_process_id = $1)`, id).Scan(&n)
	return n, err
}

func (r *DefectCatalogRepo) ReorderProcesses(ctx context.Context, ids []int) error {
	return r.reorderGeneric(ctx, "defect_processes", ids)
}

// --- Zones ---

func (r *DefectCatalogRepo) ListZones(ctx context.Context) ([]domain.DefectZone, error) {
	rows, err := executor(ctx, r.pool).Query(ctx, `
		SELECT z.id, z.code, z.name_tr, z.name_en, z.sort_order, z.is_active, z.created_at, z.updated_at,
		       (SELECT COUNT(*)::int FROM defect_parts p WHERE p.zone_id = z.id) AS part_count,
		       (SELECT COUNT(*)::int FROM issue_list i
		         JOIN defect_parts p ON p.id = i.defect_part_id
		        WHERE p.zone_id = z.id) AS usage_count
		FROM defect_zones z
		ORDER BY z.sort_order, z.id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.DefectZone
	for rows.Next() {
		var z domain.DefectZone
		if err := rows.Scan(&z.ID, &z.Code, &z.NameTR, &z.NameEN, &z.SortOrder, &z.IsActive, &z.CreatedAt, &z.UpdatedAt, &z.PartCount, &z.UsageCount); err != nil {
			return nil, err
		}
		out = append(out, z)
	}
	return out, rows.Err()
}

func (r *DefectCatalogRepo) CreateZone(ctx context.Context, z *domain.DefectZone) (int, error) {
	var id int
	err := executor(ctx, r.pool).QueryRow(ctx, `
		INSERT INTO defect_zones (code, name_tr, name_en, sort_order, is_active)
		VALUES ($1, $2, $3, $4, $5) RETURNING id`,
		strings.TrimSpace(z.Code), strings.TrimSpace(z.NameTR), strings.TrimSpace(z.NameEN), z.SortOrder, z.IsActive,
	).Scan(&id)
	return id, mapUniqueViolation(err)
}

func (r *DefectCatalogRepo) UpdateZone(ctx context.Context, z *domain.DefectZone) error {
	tag, err := executor(ctx, r.pool).Exec(ctx, `
		UPDATE defect_zones
		SET code = $2, name_tr = $3, name_en = $4, sort_order = $5, is_active = $6, updated_at = now()
		WHERE id = $1`,
		z.ID, strings.TrimSpace(z.Code), strings.TrimSpace(z.NameTR), strings.TrimSpace(z.NameEN), z.SortOrder, z.IsActive,
	)
	if err != nil {
		return mapUniqueViolation(err)
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrNotFound
	}
	return nil
}

func (r *DefectCatalogRepo) DeleteZone(ctx context.Context, id int) error {
	tag, err := executor(ctx, r.pool).Exec(ctx, `DELETE FROM defect_zones WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrNotFound
	}
	return nil
}

func (r *DefectCatalogRepo) CountZoneUsage(ctx context.Context, id int) (int, error) {
	var n int
	err := executor(ctx, r.pool).QueryRow(ctx, `
		SELECT COUNT(*)::int FROM issue_list i
		JOIN defect_parts p ON p.id = i.defect_part_id
		WHERE p.zone_id = $1`, id).Scan(&n)
	return n, err
}

func (r *DefectCatalogRepo) CountZoneParts(ctx context.Context, id int) (int, error) {
	var n int
	err := executor(ctx, r.pool).QueryRow(ctx, `SELECT COUNT(*)::int FROM defect_parts WHERE zone_id = $1`, id).Scan(&n)
	return n, err
}

func (r *DefectCatalogRepo) ReorderZones(ctx context.Context, ids []int) error {
	return r.reorderGeneric(ctx, "defect_zones", ids)
}

func (r *DefectCatalogRepo) GetZone(ctx context.Context, id int) (*domain.DefectZone, error) {
	var z domain.DefectZone
	err := executor(ctx, r.pool).QueryRow(ctx, `
		SELECT id, code, name_tr, name_en, sort_order, is_active, created_at, updated_at
		FROM defect_zones WHERE id = $1`, id).Scan(
		&z.ID, &z.Code, &z.NameTR, &z.NameEN, &z.SortOrder, &z.IsActive, &z.CreatedAt, &z.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, domain.ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &z, nil
}

// --- Parts ---

func (r *DefectCatalogRepo) ListParts(ctx context.Context, zoneID *int) ([]domain.DefectPart, error) {
	rows, err := executor(ctx, r.pool).Query(ctx, `
		SELECT p.id, p.zone_id, p.code, p.name_tr, p.name_en, p.sort_order, p.is_active, p.created_at, p.updated_at,
		       z.code, z.name_tr, z.name_en,
		       (SELECT COUNT(*)::int FROM issue_list i WHERE i.defect_part_id = p.id) AS usage_count
		FROM defect_parts p
		JOIN defect_zones z ON z.id = p.zone_id
		WHERE ($1::int IS NULL OR p.zone_id = $1)
		ORDER BY z.sort_order, p.sort_order, p.id`, zoneID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.DefectPart
	for rows.Next() {
		var p domain.DefectPart
		if err := rows.Scan(
			&p.ID, &p.ZoneID, &p.Code, &p.NameTR, &p.NameEN, &p.SortOrder, &p.IsActive, &p.CreatedAt, &p.UpdatedAt,
			&p.ZoneCode, &p.ZoneNameTR, &p.ZoneNameEN, &p.UsageCount,
		); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (r *DefectCatalogRepo) CreatePart(ctx context.Context, p *domain.DefectPart) (int, error) {
	var id int
	err := executor(ctx, r.pool).QueryRow(ctx, `
		INSERT INTO defect_parts (zone_id, code, name_tr, name_en, sort_order, is_active)
		VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
		p.ZoneID, strings.TrimSpace(p.Code), strings.TrimSpace(p.NameTR), strings.TrimSpace(p.NameEN), p.SortOrder, p.IsActive,
	).Scan(&id)
	return id, mapUniqueViolation(err)
}

func (r *DefectCatalogRepo) UpdatePart(ctx context.Context, p *domain.DefectPart) error {
	tag, err := executor(ctx, r.pool).Exec(ctx, `
		UPDATE defect_parts
		SET zone_id = $2, code = $3, name_tr = $4, name_en = $5, sort_order = $6, is_active = $7, updated_at = now()
		WHERE id = $1`,
		p.ID, p.ZoneID, strings.TrimSpace(p.Code), strings.TrimSpace(p.NameTR), strings.TrimSpace(p.NameEN), p.SortOrder, p.IsActive,
	)
	if err != nil {
		return mapUniqueViolation(err)
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrNotFound
	}
	return nil
}

func (r *DefectCatalogRepo) DeletePart(ctx context.Context, id int) error {
	tag, err := executor(ctx, r.pool).Exec(ctx, `DELETE FROM defect_parts WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrNotFound
	}
	return nil
}

func (r *DefectCatalogRepo) CountPartUsage(ctx context.Context, id int) (int, error) {
	var n int
	err := executor(ctx, r.pool).QueryRow(ctx, `SELECT COUNT(*)::int FROM issue_list WHERE defect_part_id = $1`, id).Scan(&n)
	return n, err
}

func (r *DefectCatalogRepo) ReorderParts(ctx context.Context, zoneID int, ids []int) error {
	ex := executor(ctx, r.pool)
	rows, err := ex.Query(ctx, `SELECT id FROM defect_parts WHERE zone_id = $1 ORDER BY sort_order, id`, zoneID)
	if err != nil {
		return err
	}
	defer rows.Close()
	var existing []int
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err != nil {
			return err
		}
		existing = append(existing, id)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	if !sameIntSet(existing, ids) {
		return domain.ErrDefectCatalogueReorderInvalid
	}
	for i, id := range ids {
		if _, err := ex.Exec(ctx, `UPDATE defect_parts SET sort_order = $2, updated_at = now() WHERE id = $1 AND zone_id = $3`, id, -(i + 1), zoneID); err != nil {
			return err
		}
	}
	for i, id := range ids {
		if _, err := ex.Exec(ctx, `UPDATE defect_parts SET sort_order = $2, updated_at = now() WHERE id = $1 AND zone_id = $3`, id, i+1, zoneID); err != nil {
			return err
		}
	}
	return nil
}

// --- Types ---

func (r *DefectCatalogRepo) ListTypes(ctx context.Context) ([]domain.DefectType, error) {
	rows, err := executor(ctx, r.pool).Query(ctx, `
		SELECT t.id, t.code, t.name_tr, t.name_en, t.default_process_id, t.sort_order, t.is_active, t.created_at, t.updated_at,
		       COALESCE(p.code, ''), COALESCE(p.name_tr, ''), COALESCE(p.name_en, ''),
		       (SELECT COUNT(*)::int FROM issue_list i WHERE i.defect_type_id = t.id) AS usage_count
		FROM defect_types t
		LEFT JOIN defect_processes p ON p.id = t.default_process_id
		ORDER BY t.sort_order, t.id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.DefectType
	for rows.Next() {
		var t domain.DefectType
		if err := rows.Scan(
			&t.ID, &t.Code, &t.NameTR, &t.NameEN, &t.DefaultProcessID, &t.SortOrder, &t.IsActive, &t.CreatedAt, &t.UpdatedAt,
			&t.ProcessCode, &t.ProcessNameTR, &t.ProcessNameEN, &t.UsageCount,
		); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

func (r *DefectCatalogRepo) CreateType(ctx context.Context, t *domain.DefectType) (int, error) {
	var id int
	err := executor(ctx, r.pool).QueryRow(ctx, `
		INSERT INTO defect_types (code, name_tr, name_en, default_process_id, sort_order, is_active)
		VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
		strings.TrimSpace(t.Code), strings.TrimSpace(t.NameTR), strings.TrimSpace(t.NameEN), t.DefaultProcessID, t.SortOrder, t.IsActive,
	).Scan(&id)
	return id, mapUniqueViolation(err)
}

func (r *DefectCatalogRepo) UpdateType(ctx context.Context, t *domain.DefectType) error {
	tag, err := executor(ctx, r.pool).Exec(ctx, `
		UPDATE defect_types
		SET code = $2, name_tr = $3, name_en = $4, default_process_id = $5, sort_order = $6, is_active = $7, updated_at = now()
		WHERE id = $1`,
		t.ID, strings.TrimSpace(t.Code), strings.TrimSpace(t.NameTR), strings.TrimSpace(t.NameEN), t.DefaultProcessID, t.SortOrder, t.IsActive,
	)
	if err != nil {
		return mapUniqueViolation(err)
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrNotFound
	}
	return nil
}

func (r *DefectCatalogRepo) DeleteType(ctx context.Context, id int) error {
	tag, err := executor(ctx, r.pool).Exec(ctx, `DELETE FROM defect_types WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrNotFound
	}
	return nil
}

func (r *DefectCatalogRepo) CountTypeUsage(ctx context.Context, id int) (int, error) {
	var n int
	err := executor(ctx, r.pool).QueryRow(ctx, `SELECT COUNT(*)::int FROM issue_list WHERE defect_type_id = $1`, id).Scan(&n)
	return n, err
}

func (r *DefectCatalogRepo) ReorderTypes(ctx context.Context, ids []int) error {
	return r.reorderGeneric(ctx, "defect_types", ids)
}

func (r *DefectCatalogRepo) reorderGeneric(ctx context.Context, table string, ids []int) error {
	// table is a fixed identifier from our call sites only.
	allowed := map[string]bool{
		"defect_processes": true,
		"defect_zones":     true,
		"defect_types":     true,
	}
	if !allowed[table] {
		return fmt.Errorf("invalid reorder table")
	}
	ex := executor(ctx, r.pool)
	rows, err := ex.Query(ctx, fmt.Sprintf(`SELECT id FROM %s ORDER BY sort_order, id`, table))
	if err != nil {
		return err
	}
	defer rows.Close()
	var existing []int
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err != nil {
			return err
		}
		existing = append(existing, id)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	if !sameIntSet(existing, ids) {
		return domain.ErrDefectCatalogueReorderInvalid
	}
	for i, id := range ids {
		if _, err := ex.Exec(ctx, fmt.Sprintf(`UPDATE %s SET sort_order = $2, updated_at = now() WHERE id = $1`, table), id, -(i + 1)); err != nil {
			return err
		}
	}
	for i, id := range ids {
		if _, err := ex.Exec(ctx, fmt.Sprintf(`UPDATE %s SET sort_order = $2, updated_at = now() WHERE id = $1`, table), id, i+1); err != nil {
			return err
		}
	}
	return nil
}

func sameIntSet(a, b []int) bool {
	if len(a) != len(b) {
		return false
	}
	counts := map[int]int{}
	for _, id := range a {
		counts[id]++
	}
	for _, id := range b {
		counts[id]--
		if counts[id] < 0 {
			return false
		}
	}
	for _, n := range counts {
		if n != 0 {
			return false
		}
	}
	return true
}
