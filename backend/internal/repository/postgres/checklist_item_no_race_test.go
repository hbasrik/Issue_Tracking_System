package postgres

import (
	"context"
	"errors"
	"fmt"
	"os"
	"sync"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/karea/backend/internal/domain"
)

func testPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		t.Skip("DATABASE_URL not set")
	}
	pool, err := pgxpool.New(context.Background(), url)
	if err != nil {
		t.Fatalf("pool: %v", err)
	}
	t.Cleanup(func() { pool.Close() })
	return pool
}

func insertTempTemplate(t *testing.T, pool *pgxpool.Pool) int {
	t.Helper()
	ctx := context.Background()
	var id int
	if err := pool.QueryRow(ctx,
		`INSERT INTO checklist_templates (type, name, is_active)
		 VALUES ('TEST', 'TMP_ITEMNO_RACE', FALSE)
		 RETURNING id`).Scan(&id); err != nil {
		t.Fatalf("temp template: %v", err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(),
			`DELETE FROM checklist_template_items WHERE template_id = $1`, id)
		_, _ = pool.Exec(context.Background(),
			`DELETE FROM checklist_templates WHERE id = $1`, id)
	})
	return id
}

func TestUniqueItemNoRejectsDuplicateInsert(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	tmplID := insertTempTemplate(t, pool)

	_, err := pool.Exec(ctx,
		`INSERT INTO checklist_template_items (template_id, item_no, item_text, is_active)
		 VALUES ($1, 1, 'TMP_ITEMNO_A', TRUE)`, tmplID)
	if err != nil {
		t.Fatalf("first insert: %v", err)
	}

	_, err = pool.Exec(ctx,
		`INSERT INTO checklist_template_items (template_id, item_no, item_text, is_active)
		 VALUES ($1, 1, 'TMP_ITEMNO_B', TRUE)`, tmplID)
	if !IsUniqueViolation(err) {
		t.Fatalf("second insert err = %v, want unique_violation", err)
	}
}

func TestCreateTemplateItemConcurrentDistinctItemNos(t *testing.T) {
	pool := testPool(t)
	repo := NewChecklistProgressRepo(pool)
	tmplID := insertTempTemplate(t, pool)
	ctx := context.Background()

	const workers = 2
	type result struct {
		item *domain.ChecklistTemplateItem
		err  error
	}
	out := make(chan result, workers)
	var wg sync.WaitGroup
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func(n int) {
			defer wg.Done()
			var item *domain.ChecklistTemplateItem
			var err error
			for attempt := 0; attempt < 8; attempt++ {
				item, err = repo.CreateTemplateItem(ctx, &domain.ChecklistTemplateItem{
					TemplateID: tmplID,
					ItemText:   fmt.Sprintf("TMP_RACE_%d", n),
				})
				if err == nil || !errors.Is(err, domain.ErrTemplateItemNoConflict) {
					break
				}
			}
			out <- result{item: item, err: err}
		}(i)
	}
	wg.Wait()
	close(out)

	seen := map[int16]int{}
	for r := range out {
		if r.err != nil {
			t.Fatalf("create: %v", r.err)
		}
		seen[r.item.ItemNo]++
	}
	if len(seen) != workers {
		t.Fatalf("item_no collision: %v", seen)
	}
	for no, n := range seen {
		if n != 1 {
			t.Fatalf("item_no %d used %d times", no, n)
		}
	}
}
