
# KAREA — Cursor için Sıralı Master Kodlama Promptları v1.0

**Nasıl kullanılır:** Aşağıdaki 6 prompt, `06_KAREA_Surec_Takip_Haritasi.md`'deki ADIM 4 kalemleriyle bire bir eşleşecek şekilde sırayla tasarlandı. Her birini **kendi başına, sırasıyla** Cursor'un Agent/Composer moduna yapıştırın; bir öncekinin çıktısı bir sonrakinin ön koşuludur. Prompt içerikleri İngilizce yazıldı çünkü (a) kod tabanının tamamı İngilizce olacak (Clean Code kararınız) ve (b) İngilizce promptlar kod üretim kalitesini gözle görülür şekilde artırıyor. Aralarındaki Türkçe açıklamalar yalnızca sizin takibiniz içindir, Cursor'a yapıştırmayın.

**Ön koşul (0. adım — Cursor'a geçmeden önce siz yapın):** Bu oturumda ürettiğimiz tüm dokümanları (`01`–`09` numaralı dosyalar) proje reposunda bir `/docs` klasörüne kopyalayın. Aşağıdaki her prompt bu dosyalara referans veriyor; Cursor'un bunları okuyabilmesi için repoda fiziksel olarak bulunmaları gerekir.

**Commit kuralı:** Prompt 1'in son maddesi (madde 8), Cursor'a projede kalıcı olarak geçerli olacak bir `.cursor/rules` dosyası oluşturtuyor — bundan sonra Cursor, hangi prompt'u çalıştırırsanız çalıştırın, her küçük değişiklikten sonra otomatik ve küçük harfli commit atacaktır; her prompt'un sonuna ayrıca bir şey eklemenize gerek yok. Eğer Prompt 1'i zaten çalıştırdıysanız, o maddeyi (Prompt 1'in 8. maddesini) tek başına ayrı bir mesaj olarak Cursor'a yapıştırmanız yeterli.

---

## Prompt 1 — Repository Bootstrap & Tooling
*(To-Do: "PostgreSQL instance kurulumu", repo yapısı)*

```
You are setting up a new monorepo for "Karea", an industrial vehicle production
tracking platform. Read /docs/01_KAREA_PRD.md and /docs/09_KAREA_DB_Mimari_ve_Kurulum_Notlari.md
first for context, then scaffold the following structure. All file names, folder
names, variables, and comments must be in English.

Create this monorepo layout:

/karea
  /backend                 -> Go 1.22+ module, Clean Architecture (see Prompt 2)
  /web                      -> React (Vite + TypeScript) admin dashboard
  /mobile                   -> React Native (Expo) field operator app
  /database
    /migrations             -> golang-migrate compatible .up.sql / .down.sql files
    /seed                   -> seed data scripts (reference data only)
  /docs                     -> already contains our planning docs, do not modify
  docker-compose.yml
  .env.example
  README.md

Requirements:
1. docker-compose.yml must define a `postgres` service (postgres:16, with the
   pg_trgm and uuid-ossp extensions enabled via an init script), and a `backend`
   service placeholder that builds from /backend.
2. .env.example must include DATABASE_URL, JWT_SECRET, APP_ENV, PORT.
3. backend/go.mod: module github.com/karea/backend, Go 1.22.
4. web/package.json: Vite + React 18 + TypeScript, add react-router-dom,
   recharts (for Analysis charts), and a placeholder for a PDF export library
   (jspdf + html2canvas).
5. mobile/package.json: Expo SDK (latest stable), React Navigation (bottom
   tabs + native stack), TypeScript.
6. README.md: short setup instructions (docker-compose up, migration command,
   how to run web/mobile).
7. Do not implement any business logic yet — this prompt is scaffolding only.
8. Create /.cursor/rules/git-commits.mdc with this exact content (frontmatter
   included) — this is a standing project rule, not a one-off instruction:

   ---
   description: Git commit conventions for the Karea project
   alwaysApply: true
   ---

   # Git commit rules

   - After finishing each small, independently working change (a single
     file, a single function, a single endpoint, a single component),
     create a git commit for just that change. Do not wait until an
     entire task or prompt is fully done to commit — commit incrementally
     as you go, many small commits instead of one large one.
   - Never bundle unrelated changes into a single commit.
   - Write the full commit message in lowercase — including the type
     prefix and the description, with no exceptions (e.g.
     "fix: correct vin trigram index name", not "Fix: Correct VIN...").
   - Use Conventional Commits prefixes: feat, fix, chore, docs, refactor,
     test, style, perf. Format: "<type>: <short description>".
   - Keep the summary line under 72 characters.
   - Stage only the files touched by that specific change
     (`git add <specific files>`), never a blanket `git add .` when other
     unrelated files are also dirty.

   After creating this file, apply the same commit discipline to every
   file you create in this very prompt (Prompt 1) — i.e. commit the repo
   scaffolding itself in small, lowercase, logically-grouped commits
   (e.g. one commit for docker-compose.yml + .env.example, one for
   backend/go.mod, one for web/package.json, one for mobile/package.json,
   one for README.md, one for this rules file).

When done, list every file you created and the commits you made (hash +
message) for this prompt.
```

---

## Prompt 2 — Database Migration & Seed Data
*(To-Do: "0001_init.up.sql migration olarak çalıştırılması", "Seed data yüklenmesi")*

```
Context: /docs/08_KAREA_database_schema.sql contains the full, validated
PostgreSQL DDL for Karea (validated with the pglast parser — 70 statements,
no FK ordering issues). /docs/09_KAREA_DB_Mimari_ve_Kurulum_Notlari.md
explains the architecture decisions behind it (multi-template checklists,
soft-warning vs hard-block auto status transitions, indexing strategy).

Task:
1. Copy the full contents of /docs/08_KAREA_database_schema.sql verbatim into
   /database/migrations/0001_init.up.sql. Do not alter table names, column
   names, or business logic in the triggers/functions — they encode approved
   business rules and must not be reinterpreted.
2. Write /database/migrations/0001_init.down.sql that fully reverses it (drop
   triggers, functions, tables in FK-safe reverse order, then drop the enum
   types, then drop the extensions).
3. Write seed scripts under /database/seed/:
   - 01_phases.sql — insert phases 1-8 (already present in the DDL as an
     example; keep consistent with it, do not duplicate the INSERT).
   - 02_stations_and_checkpoints.sql — create 8 stations (one per phase) and,
     for each phase, 7 to 8 checkpoints with realistic industrial automotive
     assembly names (electrical, chassis, paint, interior, final assembly,
     etc. — use your judgement, keep names in English).
   - 03_checklist_templates.sql — populate checklist_template_items for the
     two default templates already inserted by the DDL (id lookup by name):
     13 items for the EOL template, 43 items for the SHIPMENT template, with
     realistic English item text (paint finish, door seal test, lighting
     function check, infotainment test, etc.).
   - 04_users.sql — insert one seed MANAGER_ADMIN user and two seed OPERATOR
     users for local testing.
4. Add a Makefile (or npm script if more idiomatic) at repo root with targets:
   `migrate-up`, `migrate-down`, `seed` — assume golang-migrate CLI is
   installed and DATABASE_URL is read from .env.

Verify: after running migrate-up + seed, `SELECT count(*) FROM checkpoints`
should return between 56 and 64 (8 phases x 7-8 items), and
`SELECT count(*) FROM checklist_template_items` should return 56 (13 + 43).
```

---

## Prompt 3 — Go Backend: Clean Architecture Skeleton & Domain Rules
*(To-Do: "Go backend Clean Architecture katman tanımları")*

```
Context: /docs/01_KAREA_PRD.md Section 6 (Functional Requirements) and its
Decision Log (Section 10) define the business rules. Read them before writing
code. Key rules you must encode faithfully:

- Soft-warning (FR-2.5): a failed phase checkpoint never blocks progress to
  the next phase. It only excludes itself from the completion percentage
  until its linked issue is resolved.
- Hard-block (FR-3.5, FR-4.3): the EoL checklist and the Shipment checklist
  each require ALL items to be OK or CONDITIONAL_OK before the vehicle can
  exit that gate. This must be enforced in the application layer as well as
  the database layer (defense in depth) — never trust the UI alone.
- Multi-template (Decision Log #3): EoL/Shipment checklist items are not
  hardcoded; they come from checklist_templates / checklist_template_items,
  resolved per vehicle_model_id.
- RBAC (Decision Log #4): exactly two roles, OPERATOR (mobile-only) and
  MANAGER_ADMIN (web-only). Enforce this at the middleware level, not just
  in the frontend.
- Issue severity (Decision Log #7): CRITICAL / MEDIUM / LOW, mandatory on
  issue creation.

Build a Clean Architecture Go backend under /backend with these layers:

/backend
  /cmd/api/main.go              -> entrypoint, wires everything together
  /internal/domain              -> plain Go structs + enums, zero framework deps
      vehicle.go, phase.go, checkpoint.go, checklist.go, issue.go, user.go, audit.go
  /internal/usecase              -> business logic interfaces + implementations
      record_checkpoint_result.go   (soft-warning logic)
      record_checklist_result.go    (hard-block gate logic for EOL/SHIPMENT)
      search_vehicle_by_vin.go      (partial VIN search)
      manage_issue.go               (create/progress/finish/approve lifecycle:
                                      OPEN -> IN_PROGRESS -> DONE)
      get_analysis_metrics.go       (Daily Pending Issues, Completed Issues,
                                      MTTR, Defect Rate per Station, VIN x
                                      severity breakdown — read from the SQL
                                      views defined in 08_KAREA_database_schema.sql)
  /internal/repository
      /postgres                    -> concrete implementations using pgx or
                                       database/sql + sqlx (your choice, state
                                       which one and why in a short comment
                                       at the top of the package)
      interfaces.go                -> repository interfaces consumed by usecase layer
  /internal/delivery/http         -> handlers, routing, middleware (built in Prompt 4)
  /internal/platform
      /auth                        -> JWT issuing/parsing, RBAC middleware
      /config                      -> env var loading

Rules for this prompt:
1. Domain structs must mirror the DDL exactly (same field names translated to
   Go idiom, e.g. vin string, currentGlobalStatus VehicleStatus).
2. Implement RecordCheckpointResult and RecordChecklistResult as pure usecase
   functions with unit tests proving: (a) a NOT_OK checkpoint does not block
   the next phase's checkpoints from being recorded, (b) a SHIPMENT checklist
   with one item not in {OK, CONDITIONAL_OK} returns a domain error and does
   NOT allow a status transition attempt to proceed.
3. Every exported function needs a doc comment. All comments in English.
4. Do not build HTTP handlers yet — that is Prompt 4. This prompt is domain +
   usecase + repository interfaces + Postgres implementations + unit tests only.

When done, run `go build ./...` and `go test ./...` and report the output.
```

---

## Prompt 4 — Go Backend: HTTP API, RBAC Middleware, VIN Search
*(To-Do: backend API katmanı — orijinal listede zımni, ADIM 4 kapsamına dahil edildi)*

```
Context: continue the Clean Architecture backend from Prompt 3. Use
/docs/07_KAREA_UIUX_Tasarim_Rehberi.md Section 2 (page hierarchy) to infer
which endpoints the web dashboard and mobile app will call.

Build /internal/delivery/http with:

1. Router setup (chi or gin — pick one, justify briefly in a comment) exposing:
   - POST   /api/v1/auth/login
   - GET    /api/v1/vehicles?vin=&status=&model=&page=          (Manager/Admin only)
   - GET    /api/v1/vehicles/:vin                                 (both roles)
   - PATCH  /api/v1/vehicles/:vin/status                          (Manager/Admin only,
             must call the hard-block-aware usecase, must return 409 with the
             list of blocking items when the gate rejects the transition)
   - GET    /api/v1/vehicles/search?vin_suffix=00057               (VIN partial
             search — both roles, powered by the pg_trgm index)
   - POST   /api/v1/vehicles/:vin/checkpoints/:checkpointId        (Operator only,
             soft-warning semantics)
   - POST   /api/v1/vehicles/:vin/checklist/:type/:itemId          (Operator only,
             type is eol|shipment, hard-block semantics, mandatory description
             validation for NOT_OK/REWORK/CONDITIONAL_OK per FR-3.3)
   - POST   /api/v1/issues                                         (Operator only,
             severity required)
   - PATCH  /api/v1/issues/:id/status                               (Manager/Admin
             only for closing/approving; Operator may only move OPEN -> IN_PROGRESS)
   - GET    /api/v1/analysis/daily-pending-issues?from=&to=
   - GET    /api/v1/analysis/vehicle-severity-breakdown?vin_suffix=&from=&to=
   - GET    /api/v1/analysis/defect-rate-per-station?from=&to=
   - GET    /api/v1/analysis/mttr?from=&to=

2. RBAC middleware that reads the role claim from the JWT and rejects (403)
   any Operator request to a Manager/Admin-only route and vice versa — write
   a table-driven test proving both directions are enforced.

3. Input validation: reject requests with a 400 and a clear error message
   when a hard-block or mandatory-description rule is violated at the API
   layer (do not rely solely on the DB constraint — surface a friendly error).

4. Standard error envelope: { "error": { "code": "...", "message": "..." } }.

When done, provide a short curl example for the checklist hard-block error
case (attempting to move a vehicle to WITH_CUSTOMER with an incomplete
shipment checklist) showing the 409 response body.
```

---

## Prompt 5 — React Web Dashboard (Manager/Admin)
*(To-Do: "React web dashboard modül iskeleti")*

```
Context: read /docs/07_KAREA_UIUX_Tasarim_Rehberi.md fully before starting —
it defines the exact page hierarchy (Section 2.1), the component-level layout
for each screen (Section 4), the color tokens for dark/light mode (Section 1.1),
and the status badge standards (Section 5). Follow it precisely; do not invent
a different navigation structure.

In /web, build:

1. Routing matching this sitemap exactly:
   /                    -> Home/Overview (KPI cards + attention-needed table)
   /vehicles            -> Vehicle list (filterable table)
   /vehicles/:vin       -> Vehicle detail, tabs: Overview / EoL / Shipment / Issues / Audit Log
   /issues              -> Issue list + detail
   /analysis            -> Analysis tab (see detailed spec below)
   /templates           -> Checklist template admin (list + editor)
   /users               -> User & role management
   /settings            -> Dark/light mode, preferences

2. A theme provider implementing the exact color tokens from Section 1.1 of
   the design guide (dark mode default), with a light/dark toggle persisted
   in memory (no localStorage per this session's constraints — use React
   context state).

3. The Analysis page must include, wired to the /api/v1/analysis/* endpoints
   from Prompt 4:
   - Filter bar: date range, phase (1-8), vehicle status, issue type, AND a
     VIN suffix search box (reuses the same search component as the vehicle
     list).
   - A Pie chart (completed vs in-progress vehicles) and a Bar chart
     (elapsed time / MTTR per station) using recharts.
   - A table + stacked bar showing the vehicle-level open issue severity
     breakdown (VIN, Total, Critical, Medium, Low columns) — this is the
     "VIN 00057: 8 open issues — 3 critical, 2 medium, 3 low" feature from
     our Decision Log #7.
   - An "Export / Print" button that renders the current filtered view
     (filters summary + charts + the severity breakdown table) into an
     A4-formatted PDF using jspdf + html2canvas, matching what's on screen.

4. Use only role-gated routes: redirect any user without the MANAGER_ADMIN
   role claim to a "not authorized" screen (Operators should never reach the
   web app in practice, but defend anyway).

5. Status badges (checkpoint, EoL item, shipment item, vehicle status, issue,
   issue severity) must use the exact color mapping from Section 5 of the
   design guide.

Do not worry about pixel-perfect styling — focus on correct structure, correct
data flow, and correct color token usage. When done, list the routes and
components you created.
```

---

## Prompt 6 — React Native Mobile App (Operator)
*(To-Do: "React Native (Expo) mobil modül iskeleti")*

```
Context: read /docs/07_KAREA_UIUX_Tasarim_Rehberi.md Sections 2.2 and 3 before
starting — they define the exact bottom-tab structure and the component
layout for each screen (8-phase screen, EoL checklist screen, shipment
checklist screen, hata girme formu).

In /mobile, build:

1. Bottom tab navigation: Home, Search (VIN suffix search + typeahead),
   My Station (queue of vehicles at the operator's active station), Profile.

2. Stack navigation from a selected vehicle into:
   - Phase Progress screen: progress ring (SVG, matches the % from the
     backend), 8-phase stepper, expandable checkpoint accordion for the
     active phase. A failed checkpoint shows a "Report Issue" button that
     navigates to the Issue Report form with vin/checkpointId/phase/station
     prefilled and read-only.
   - Issue Report form: description (required), severity picker (Critical /
     Medium / Low, required — do not let the user submit without it), photo
     attachment placeholder (can be a stub using expo-image-picker).
   - EoL Checklist screen: segmented control per item (OK / NOT_OK / REWORK /
     CONDITIONAL_OK), conditional required-description field that only
     appears for non-OK selections, sticky footer showing "Ready to exit" or
     "N items blocking" with a bottom-sheet listing the blocking items when
     tapped while blocked.
   - Shipment Checklist screen: simple checkbox list grouped into logical
     sections, progress bar with "X / 43 completed" counter, sticky footer
     showing remaining count, locked submit until 43/43.

3. All screens must call the API endpoints from Prompt 4. Attach the JWT to
   every request; if the role claim is not OPERATOR, show an "unauthorized"
   screen (defense in depth, mirrors the web app's guard).

4. Implement the soft-warning UX explicitly: after reporting an issue on a
   checkpoint, the user must be able to immediately continue to the next
   phase without any blocking dialog — only a small badge/counter indicating
   an open issue exists for that phase.

5. Use the same color tokens as the web app (Section 1.1 of the design
   guide) — create a small shared constants file for this if useful.

When done, list the screens and navigators you created, and confirm which
screens call which API endpoints.
```

---

## Ek (Opsiyonel) — Cursor'un To-Do Listesini Kendisi Güncellemesi

`06_KAREA_Surec_Takip_Haritasi.md`'yi `/docs` altına koyduğunuzda, Cursor bu dosyayı okuyup güncelleyebilir. Herhangi bir prompt'un **sonuna** şu satırı eklerseniz, Cursor o promptu bitirdiğinde ilgili checkbox'ları kendisi işaretler ve tek satırlık bir not düşer:

```
When finished, also update /docs/06_KAREA_Surec_Takip_Haritasi.md: check off
(change [ ] to [x]) the ADIM 4 checklist items this prompt satisfies, and add
one short note (in Turkish, matching the rest of that file) describing what
was actually built. Do not modify any other section of the file.
```

Bu şekilde repo'daki to-do listesi git geçmişiyle birlikte otomatik ilerler; siz de arada bu dosyayı bana yapıştırarak (veya kısaca özetleyerek) senkronize olabiliriz.

---

## Test & Doğrulama Notu (Prompt 3-6 sonrası, sizin için)

Her prompt tamamlandığında, `05_KAREA_Test_Cases.md`'deki ilgili TC-ID'leri manuel olarak (veya Cursor'a "TC-003, TC-004b, TC-007, TC-008/009, TC-011, TC-017'yi bu koda karşı otomasyon testi olarak yaz" diye ayrı bir takip promptu vererek) doğrulamanızı öneririm. İsterseniz bunun için ayrı bir 7. prompt ("Test & CI") hazırlayabilirim — şu an Cursor'da ilerlerken ihtiyaç duyarsanız söyleyin, ekleyelim.

---

*Bu promptları sırayla Cursor'a verip ilerledikçe, takıldığınız veya sonucu beklediğinizden farklı çıkan her noktada buraya dönüp birlikte değerlendirebiliriz.*
