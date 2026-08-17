
# KAREA — v2 Cursor Master Promptları

**Nasıl kullanılır:** Bunlar `10_KAREA_Cursor_Master_Promptlar.md`'deki Prompt 1-6'nın **devamı**, sıfırdan yazım değil. Mevcut kod tabanının üzerine küçük, doğrulanabilir adımlarla inşa eder — tıpkı v1'de olduğu gibi, her birini sırayla, tek tek Cursor'a yapıştırın; öncekinin tamamlanmasını bekleyin. `.cursor/rules/git-commits.mdc` zaten kurulu olduğu için commit disiplini otomatik devam eder, ayrıca bir şey eklemenize gerek yok.

**Önce yapmanız gereken:** `11_KAREA_v2_Mimari_Mutabakat_Dokümanı.md` ve `12_KAREA_v2_database_schema.sql` dosyalarını da `/docs` klasörüne kopyalayın (01-10 ile birlikte kalsın, referans için siliyoruz demiştiniz ama gap-analysis için hâlâ gerekliler).

**Not — veri kaybı:** Şu anda repoda gerçek üretim verisi yok (sadece seed/test verisi). Bu yüzden Prompt 7, tabloları drop edip v2 DDL'den yeniden kurma serbestliğini kullanıyor — eğer ileride gerçek veri varken benzer bir değişiklik gerekirse, o zaman ayrı bir "veri taşıma" promptu hazırlarız.

---

## Prompt 7 — Database Migration v2 (Station/Step rename, RBAC tabloları, EOL 3-fazlı workflow, Test modülü, vehicle_number, media_attachments)

```
Context: /docs/12_KAREA_v2_database_schema.sql is the full, validated v2 DDL
for Karea (validated with the pglast parser — 94 statements, no FK ordering
issues). /docs/11_KAREA_v2_Mimari_Mutabakat_Dokümanı.md explains every
decision behind it (Karar 1-8). It supersedes /docs/08_KAREA_database_schema.sql.

The local database currently only holds seed/test data from migration 0001 —
no real production data exists yet, so this migration is allowed to drop and
recreate the affected objects rather than doing a data-preserving ALTER
migration.

Task:
1. Create /database/migrations/0002_v2_architecture.up.sql that:
   - Drops the v1 objects being replaced (in FK-safe order): production_phase_progress,
     eol_and_shipment_checklist_progress, checkpoints, phases, and the
     user_role_enum-based role column on users — but do NOT drop vehicles,
     issue_list, audit_logs, checklist_templates, checklist_template_items,
     users, vehicle_models, issue_types (these carry forward, some with new
     columns).
   - Creates every new/renamed object from /docs/12_KAREA_v2_database_schema.sql:
     roles, permissions, role_permissions, stations, station_steps,
     vehicle_station_step_progress, checklist_item_progress,
     vehicle_eol_workflow, media_attachments, the new/changed enum types
     (checklist_type_enum + TEST, issue_status_enum + CONDITIONAL_APPROVED,
     eol_item_phase_enum, eol_workflow_stage_enum, issue_source_enum with
     STATION_STEP/TEST_ITEM, audit_event_enum with EOL_WORKFLOW_STAGE_CHANGE/
     MEDIA_UPLOADED), and the new columns (vehicles.vehicle_number,
     vehicles.current_station_id, vehicles.test_template_id,
     checklist_template_items.eol_phase, issue_list.source_station_step_id,
     issue_list.conditional_approve_reporter_id/conditional_approve_date).
   - Migrates users.role (old enum column) to users.role_id (new FK to
     roles), then drops the old role column and user_role_enum.
   - Re-creates every trigger/function/view exactly as defined in
     /docs/12_KAREA_v2_database_schema.sql — do not reinterpret the business
     logic (soft-warning branch shipment, hard-block depot release, etc.).
   - Do not alter table names, column names, or business logic beyond what
     /docs/12_KAREA_v2_database_schema.sql specifies — it encodes approved
     decisions and must not be reinterpreted.
2. Write /database/migrations/0002_v2_architecture.down.sql that fully
   reverses it back to the 0001 shape (best-effort; note in a comment that
   any v2-only data — e.g. EOL workflow stage history — is lost on rollback,
   which is expected/acceptable at this pre-production stage).
3. Update /database/seed/ scripts:
   - Replace 01_phases.sql with 01_stations.sql (8 stations, same names as
     before, renamed table).
   - Replace 02_stations_and_checkpoints.sql with 02_stations_and_steps.sql
     (station_steps instead of checkpoints, same content otherwise).
   - Update 03_checklist_templates.sql: EOL template now needs 16 items
     tagged eol_phase (mix of BRANCH and DEPOT, your judgement on a
     realistic split, e.g. 9 BRANCH / 7 DEPOT), SHIPMENT stays 43 items
     unchanged, add a new TEST template with 45 items (realistic English
     item text for an end-of-line functional test: brake test, wheel
     alignment, headlight aim, OBD diagnostic scan, etc.).
   - Update 04_users.sql: seed the same 3 users but insert against the new
     roles table (role_id lookup by code) instead of the old enum.
   - Add 05_permissions.sql if not already covered by the migration itself
     (the migration inserts the roles/permissions/role_permissions seed rows
     per /docs/12_KAREA_v2_database_schema.sql Section 11 — only add this
     file if you need additional seed permissions beyond that set).
4. Update the Makefile/npm scripts if the seed file list changed.

Verify (report actual output, not just "should work"):
- `migrate-up` runs clean against a fresh database (migration 0001 then 0002).
- `SELECT count(*) FROM stations` = 8, `SELECT count(*) FROM station_steps`
  between 56-64.
- `SELECT count(*) FROM checklist_template_items WHERE template_id = (SELECT
  id FROM checklist_templates WHERE type='EOL')` = 16, same query for
  SHIPMENT = 43, for TEST = 45.
- `SELECT count(*) FROM roles` = 2, `SELECT count(*) FROM users WHERE
  role_id IS NOT NULL` = 3 (no NULLs).
- `migrate-down` reverses 0002 cleanly, then reverses 0001 cleanly, back to
  an empty database.
- Re-run pglast parsing (or `psql -f` with --dry-run if pglast is not set up
  in this repo) against both new migration files and paste the result.
```

---

## Prompt 8 — RBAC Refactor (table-driven roles/permissions)

```
Context: Karar 3 in /docs/11_KAREA_v2_Mimari_Mutabakat_Dokümanı.md replaces
the hardcoded 2-value user_role_enum with roles/permissions/role_permissions
tables (migration 0002 already created these and migrated users.role_id).
The goal is extensibility for the v2 spec's eventual 8-role matrix, without
implementing all 8 roles now — only OPERATOR and MANAGER_ADMIN exist today.

Task:
1. Update /internal/domain: replace the old UserRole enum type with a Role
   struct (ID, Code, Name) and a Permission struct (ID, Code). Update the
   User domain struct's Role field accordingly.
2. Update /internal/repository: add a RoleRepository with
   GetPermissionsForUser(ctx, userID) ([]Permission, error) — a single query
   joining users -> roles -> role_permissions -> permissions.
3. Update /internal/platform/auth: the JWT should now embed both role_code
   (e.g. "OPERATOR") for coarse UI decisions and — critically — the
   middleware must check permission codes, not role codes, for endpoint
   authorization. Add a small permission-checking middleware:
   RequirePermission(code string) that 403s if the authenticated user's
   permission set (looked up via RoleRepository, cache in the request
   context to avoid N+1 per request) does not include it.
4. Re-map every existing RBAC-gated route from Prompt 4 to the new
   permission codes seeded in /docs/12_KAREA_v2_database_schema.sql Section
   11 (e.g. vehicle.view, station_step.update, checklist_item.update,
   issue.create, issue.transition.in_progress, issue.transition.done,
   issue.transition.approve, issue.transition.conditional_approve,
   analysis.view, admin.manage_masters). Do not change any route path or
   HTTP method — only the authorization check underneath.
5. Update the existing RBAC middleware test from Prompt 4 (table-driven,
   proving both directions are enforced) to assert on permission codes
   instead of role codes — keep the same two seeded roles/behaviors so the
   observable behavior for today's 2 roles is unchanged, only the mechanism
   is now table-driven.

This is a mechanism change, not a behavior change — OPERATOR and
MANAGER_ADMIN should be authorized for exactly the same things as before.

When done, run `go build ./...` and `go test ./...` and report the output.
```

---

## Prompt 9 — Backend: Station/Step Rename + EOL 3-Stage Workflow

```
Context: Karar 1 and Karar 2 in /docs/11_KAREA_v2_Mimari_Mutabakat_Dokümanı.md.
Migration 0002 already renamed phases/checkpoints to stations/station_steps
and created vehicle_eol_workflow. This prompt updates the Go backend to
match.

Task:
1. Rename throughout /internal/domain, /internal/usecase, /internal/repository,
   /internal/delivery/http: Phase -> Station, Checkpoint -> StationStep,
   RecordCheckpointResult -> RecordStationStepResult,
   production_phase_progress references -> vehicle_station_step_progress.
   Keep the soft-warning behavior identical (a NOT_OK station step never
   blocks progress to the next station) — this is a rename, not a logic
   change.
2. Rename the old single-gate EOL usecase/handler to reflect that EOL is now
   a 3-stage workflow (Karar 2):
   - internal/usecase/eol_branch_ship.go: marks
     vehicle_eol_workflow.branch_shipped_at, snapshots the open-issue count
     (does NOT block — soft-warning only, matching what the DB trigger
     fn_enforce_branch_shipment already enforces), sets vehicle status to
     IN_WAREHOUSE. Return the open-issue count in the response so the UI can
     show the warning banner even though the action succeeded.
   - internal/usecase/eol_depot_release.go: marks
     vehicle_eol_workflow.depot_released_at — hard-block, must return a
     structured error (409, matching the pattern from Prompt 4's shipment
     hard-block) listing the blocking open issues when any exist, mirroring
     what fn_enforce_depot_release enforces at the DB layer. Application
     layer must check this BEFORE attempting the DB write too (defense in
     depth per PRD FR-3.6 principle).
   - internal/usecase/eol_document_approve.go: marks
     vehicle_eol_workflow.document_approved_at, sets vehicle status to
     SHIPPED.
   All three must be permission-gated on the new eol.branch_ship /
   eol.depot_release / eol.document_approve permission codes from Prompt 8.
3. Add corresponding HTTP endpoints to /internal/delivery/http:
   - POST /api/v1/vehicles/:vin/eol/branch-ship
   - POST /api/v1/vehicles/:vin/eol/depot-release
   - POST /api/v1/vehicles/:vin/eol/document-approve
   - GET  /api/v1/vehicles/:vin/eol (returns current_stage + all 3
     timestamps + who performed each, for the Vehicle Detail EoL tab)
4. Unit tests proving: (a) branch-ship succeeds and returns a non-blocking
   warning even with open issues present, (b) depot-release returns 409 with
   the blocking issue list when open issues exist and does NOT write
   depot_released_at, (c) depot-release succeeds and advances the stage when
   no open issues exist, (d) document-approve sets vehicle status to SHIPPED.

When done, run `go build ./...` and `go test ./...` and report the output,
plus a curl example for the depot-release 409 case showing the response body.
```

---

## Prompt 10 — Backend: Test Checklist Module + Şartlı Onay (Conditional Approval)

```
Context: Karar 4 and Karar 6 in /docs/11_KAREA_v2_Mimari_Mutabakat_Dokümanı.md.
checklist_type_enum now includes TEST (45 items) as a third, independent
checklist alongside EOL and SHIPMENT — it reuses the existing
checklist_item_progress table and multi-template machinery from Prompt 3, no
new table family. issue_status_enum now includes a 5th value,
CONDITIONAL_APPROVED, as an alternate terminal branch from DONE (alongside
APPROVED).

Task:
1. Confirm/extend RecordChecklistResult (from Prompt 3) already generalizes
   over checklist_type — if it was hardcoded to eol|shipment anywhere
   (validation, route parsing, etc.), widen it to eol|shipment|test. The
   Test checklist has no hard-block gate tied to a vehicle status transition
   (per the v2 spec, it's informational/quality tracking, not a shipping
   gate) — confirm this assumption is reflected: completing/not completing
   Test items must NOT affect vehicle status auto-transitions.
2. Add HTTP route: POST /api/v1/vehicles/:vin/checklist/test/:itemId
   (Operator only, same mandatory-description-on-non-OK semantics as
   eol/shipment).
3. Extend the issue status transition usecase (manage_issue.go from Prompt
   3) to support DONE -> CONDITIONAL_APPROVED as a sibling to the existing
   DONE -> APPROVED, both gated on the same
   issue.transition.approve / issue.transition.conditional_approve
   permission codes (Manager/Admin only, per Prompt 8). Reject any attempt
   to move an issue that is already APPROVED or CONDITIONAL_APPROVED
   further (both are terminal).
4. Update PATCH /api/v1/issues/:id/status (from Prompt 4) to accept
   "CONDITIONAL_APPROVED" as a valid target status, writing
   conditional_approve_reporter_id/conditional_approve_date instead of
   approve_reporter_id/approve_date.
5. Update the Analysis "Kalite Onayı Bekleyenler" query/usecase (backed by
   vw_issues_pending_quality_approval) — no view change needed since it
   already only looks at status = 'DONE', confirm the Go usecase doesn't
   have its own separate hardcoded status list that needs the same update.

Unit tests: (a) DONE -> CONDITIONAL_APPROVED succeeds for Manager/Admin,
403s for Operator, (b) an already-CONDITIONAL_APPROVED issue rejects any
further transition, (c) a Test checklist item update does not trigger any
vehicle status change (assert vehicles.current_global_status is unchanged
before/after).

When done, run `go build ./...` and `go test ./...` and report the output.
```

---

## Prompt 11 — Backend: Vehicle Number Lookup + Media Attachments

```
Context: Karar 5 and Karar 8 in /docs/11_KAREA_v2_Mimari_Mutabakat_Dokümanı.md.
vehicles.vehicle_number (short number) now resolves to the same row as vin —
no separate Full_VIN_List table. media_attachments is a new polymorphic
table for file uploads, replacing the plan to keep adding one-off *_url
columns.

Task:
1. Add GET /api/v1/vehicles/resolve?vehicle_number=12345 — returns the full
   vehicle record (same shape as GET /api/v1/vehicles/:vin) by looking up
   vehicle_number. 404 with a clear error if not found. Available to both
   roles (mirrors the existing VIN search endpoint's access level).
2. Add vehicle_number as an optional field on vehicle creation/seed
   endpoints if one exists, and to the vehicle list filter
   (GET /api/v1/vehicles?vehicle_number=...) alongside the existing vin
   filter.
3. Add a MediaRepository + usecase (UploadMedia) that inserts into
   media_attachments. For this prompt, storage_path can point at local disk
   under /backend/uploads (gitignored) — do not integrate S3/cloud storage
   yet, that's a future decision, just get the data model and API working
   end-to-end.
4. Add endpoints:
   - POST /api/v1/media (multipart form: entity_type, entity_id, file) —
     validates entity_type is one of VEHICLE|ISSUE|CHECKLIST_ITEM_PROGRESS|
     STATION_STEP_PROGRESS, validates entity_id actually exists for that
     entity_type before accepting the upload (application-level referential
     integrity, since the DB table is intentionally polymorphic/unenforced).
   - GET /api/v1/media?entity_type=&entity_id= — lists attachments for an
     entity, used by the Vehicle Detail / Issue Detail screens.
5. Do not migrate the existing picture_url / check_image_url columns yet —
   leave them as-is (Karar 8 says this is a gradual migration); just make
   the new media_attachments path available for new uploads going forward.

Unit tests: (a) uploading media against a non-existent entity_id returns a
clear 400/404, not a silent insert, (b) listing media for an entity that has
none returns an empty array, not an error.

When done, run `go build ./...` and `go test ./...` and report the output.
```

---

## Prompt 12 — Web Dashboard: v2 UI Updates

```
Context: this extends the web dashboard from Prompt 5 to reflect Karar 1, 2,
4, 5, 6, 8 — it does not rebuild the dashboard, it adds/renames screens on
top of the existing routing and theme system.

Task:
1. Rename "Phase"/"Checkpoint" UI labels and route params to "Station"/
   "Station Step" throughout — grep for the old terms in /web/src and update
   both the visible copy and any variable names that mirror the domain.
2. On the Vehicle Detail page (/vehicles/:vin), replace the single "EoL" tab
   with an "EoL" tab that shows the 3-stage workflow: a horizontal stepper
   (Branch -> Depot -> Document) using vw_eol_workflow_funnel-backed data
   from GET /api/v1/vehicles/:vin/eol, each stage showing its checklist
   items (filtered by eol_phase for Branch/Depot) plus an action button
   (Ship to Depot / Release from Depot / Approve Document) gated on the
   corresponding permission from Prompt 8. The "Release from Depot" button
   must show a blocking-issues modal (reusing the 409 response shape from
   Prompt 9) instead of silently failing when blocked. The "Ship to Depot"
   button must show a non-blocking warning toast/banner when open issues
   exist, then proceed.
3. Add a "Test" tab next to EoL/Shipment on the Vehicle Detail page, same
   checklist UI pattern as Shipment (progress counter, no hard-block gate).
4. Add vehicle_number as a visible, read-only field next to VIN wherever VIN
   is shown, and add a vehicle-number search box next to the existing VIN
   suffix search box on /vehicles (calls
   GET /api/v1/vehicles/resolve?vehicle_number=).
5. On the Issues tab / Issue Detail, add the "Şartlı Onay" (Conditional
   Approve) action as a sibling button to the existing Approve button for
   DONE-status issues, Manager/Admin only — same permission-gating pattern
   as the rest of the app.
6. Add a simple attachment gallery (thumbnail grid + upload button) to
   Vehicle Detail and Issue Detail, backed by
   GET/POST /api/v1/media from Prompt 11.

Keep the existing color tokens, page hierarchy, and Analysis tab untouched
except where explicitly listed above. When done, list the components/routes
you added or changed.
```

---

## Prompt 13 — Mobile App: v2 UI Updates

```
Context: this extends the mobile app from Prompt 6 to reflect Karar 1, 2, 4,
5 — it does not rebuild the app, it adds/renames screens on top of the
existing navigation.

Task:
1. Rename "Phase"/"Checkpoint" UI labels and route params to "Station"/
   "Station Step" throughout /mobile/src, same as the web app.
2. Update the EoL Checklist screen to show only the operator-relevant part
   of the 3-stage workflow: items tagged eol_phase = BRANCH while the
   vehicle's EoL stage is BRANCH, items tagged DEPOT while it's DEPOT. The
   "Ship to Depot" and "Release from Depot" actions are Manager/Admin-only
   per Prompt 8/12 — do NOT add buttons for them here; the operator's job is
   only to complete the checklist items, the workflow-stage actions live on
   the web dashboard. If the operator opens the EoL screen while stage is
   DOCUMENT (no items left for them), show a simple "Awaiting document
   approval" state instead of an empty list.
3. Add a "Test" tab/screen alongside the existing Shipment Checklist screen,
   same UI pattern (checkbox list, progress counter), calling
   POST /api/v1/vehicles/:vin/checklist/test/:itemId from Prompt 10.
4. Add vehicle_number as an alternate search mode on the Search screen
   (toggle or second input next to the existing VIN suffix search), calling
   GET /api/v1/vehicles/resolve?vehicle_number= from Prompt 11.
5. Add a simple photo-attachment flow on the Issue Report form (from Prompt
   6) that actually uploads via POST /api/v1/media instead of the previous
   expo-image-picker stub, tagging entity_type=ISSUE once the issue is
   created (upload after create, since the issue id doesn't exist yet at
   form-fill time).

Keep all existing screens, tab structure, and soft-warning UX untouched
except where explicitly listed above. When done, list the screens you added
or changed and confirm which new API endpoints each one calls.
```

---

## Doğrulama Notu

Her prompt sonrası `05_KAREA_Test_Cases.md`'e v2 için yeni TC-ID'ler eklememiz gerekecek (özellikle EOL 3-fazlı workflow ve Şartlı Onay için) — isterseniz Prompt 9-10 tamamlandıktan sonra bunu birlikte güncelleriz. Ayrıca `01`-`07` numaralı dokümanları v2 kararlarına göre revize etme işini (şu an planlı ama henüz yapılmadı) bu prompt sırası ilerledikçe, kod ile senkron kalacak şekilde ele alacağız — hepsini şimdiden yazıp sonra kodla çelişmesindense, kod ilerledikçe dokümanı güncellemek daha güvenli.
