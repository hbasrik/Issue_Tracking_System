# Seed Data

Reference data scripts for local development. Run them after migrations in
the following order:

- `01_stations.sql` — insert-only; renames only the untouched
  `Station N` placeholders from migration 0002, never writes `is_active`
- `02_stations_and_steps.sql` — insert-only `DO NOTHING`; finds stations by
  `sequence_no`, so renamed stations still get their missing steps
- `03_checklist_templates.sql` — real shop-floor checklist items;
  insert-only. SHIPMENT (46) and TEST (43) are exported from production
  content. EOL (104) = KY.FR-09 (39, branch, item_no 1–39) + 9 kept
  pre-form items (7 branch at 40–46, 2 depot at 103–104) + KY.FR-19 (56,
  depot, 47–102), form items copied from `docs/21_KAREA_Yeni_Formlar.md`
  with acceptance criterion, control method, section, `form_code` and
  `form_item_ref`. A seed item is present when its template has a row with
  its `seed_key`, never matched on `item_no` (reorder renumbers it):
  `md5(item text)` for non-form items (migration 0034),
  `'<form_code>:<form_item_ref>'` for form items (Karar 30, e.g.
  `KY.FR-19:46`). Requires migration 0041.
- `04_users.sql`
- `05_defect_catalog.sql` — defect zones / parts / types / processes;
  insert-only `ON CONFLICT (code) DO NOTHING`, so re-running it on a live
  install only adds missing rows and never reverts catalogue edits
- `06_test_vehicles.sql` — **DEV/TEST DATA ONLY.** 18 fixture vehicles
  covering every station / EoL / issue state. Never apply in production.

Roles and permissions are inserted by migration `0002_v2_architecture`
(Section 11); no separate permissions seed is required.

Load order matters due to foreign key dependencies.

From the repository root, run all scripts with:

```sh
make seed
```

## Checklist items note

`03_checklist_templates.sql` seeds **active** production checklist text
only. Inactive / test-only rows that may exist in a long-lived dev DB
(e.g. `Test Depo Madde`, inactive English TEST 44–45 leftovers) are
intentionally omitted.

**Rule: never change the text of an EXISTING non-form checklist item in
the seed file.** Its seed key is derived from the text (`md5(item text)`),
so an edited text looks like a new item to the seed and it inserts a second
copy next to the original. Text corrections are made in the admin screen.
Only add NEW items to the seed file. Form items are keyed by form identity,
so their text may be corrected here, but the seed never updates an existing
row: a corrected text reaches only fresh installs.

Removing an item from this file does not remove it from an existing
database (insert-only). The six EOL items replaced by the forms (Software
Update, Fonksiyonel Komponet Kontrolü, EE Check, Görsel Kontrol, Görsel
Kontrol 2, Depo Sürüş) are therefore absent only on a fresh install; on a
running install they are deactivated in the admin screen.

**Production:** the seed is run once on an empty install (migrations, then
01, 02, 03, 05, a secure admin instead of 04, never 06, then
`reset_and_load_vins.sql` so every vehicle gets progress rows for the
current items). After go-live, do not re-run 03 against production: admin
edits are kept, but items added by admin have no seed key.

## 500 VIN load (not part of `make seed`)

Bulk PLANNED VIN import lives at
`database/scripts/reset_and_load_vins.sql`. It truncates operational
vehicle data and inserts 500 VINs; see `docs/09_KAREA_DB_Mimari_ve_Kurulum_Notlari.md`
§5 for when to run it in a production install.
