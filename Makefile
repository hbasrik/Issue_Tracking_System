ifneq (,$(wildcard .env))
include .env
export
endif

MIGRATIONS_PATH := database/migrations
SEED_PATH := database/seed

.PHONY: migrate-up migrate-down seed verify-seed

migrate-up:
	@test -n "$(DATABASE_URL)" || (echo "DATABASE_URL is not set" && exit 1)
	migrate -path $(MIGRATIONS_PATH) -database "$(DATABASE_URL)" up

migrate-down:
	@test -n "$(DATABASE_URL)" || (echo "DATABASE_URL is not set" && exit 1)
	migrate -path $(MIGRATIONS_PATH) -database "$(DATABASE_URL)" down 1

seed:
	@test -n "$(DATABASE_URL)" || (echo "DATABASE_URL is not set" && exit 1)
	@for file in $(SEED_PATH)/[0-9][0-9]_*.sql; do \
		echo "Applying $$file"; \
		psql "$(DATABASE_URL)" -v ON_ERROR_STOP=1 -f "$$file" || exit 1; \
	done

verify-seed:
	@test -n "$(DATABASE_URL)" || (echo "DATABASE_URL is not set" && exit 1)
	@psql "$(DATABASE_URL)" -v ON_ERROR_STOP=1 -c "\
		SELECT count(*) AS checkpoint_count FROM checkpoints; \
		SELECT count(*) AS checklist_item_count FROM checklist_template_items;"
