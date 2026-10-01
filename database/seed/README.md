# Seed Data

Reference data scripts for local development. Run them after migrations in
the following order:

- `01_stations.sql` — insert-only; renames only the untouched
  `Station N` placeholders from migration 0002, never writes `is_active`
- `02_stations_and_steps.sql` — insert-only `DO NOTHING`; finds stations by
  `sequence_no`, so renamed stations still get their missing steps
- `03_checklist_templates.sql` — real shop-floor checklist items (EOL /
  SHIPMENT / TEST) exported from production content; insert-only. A seed
  item is present when its template has a row with
  `seed_key = md5(item text)` (migration 0034), never matched on `item_no`
  (reorder renumbers it). Requires migration 0034.
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

**Rule: never change the text of an EXISTING checklist item in the seed
file.** The seed key is derived from the text (`md5(item text)`), so an
edited text looks like a new item to the seed and it inserts a second copy
next to the original. Text corrections are made in the admin screen. Only
add NEW items to the seed file.

## 500 VIN load (not part of `make seed`)

Bulk PLANNED VIN import lives at
`database/scripts/reset_and_load_vins.sql`. It truncates operational
vehicle data and inserts 500 VINs; see `docs/09_KAREA_DB_Mimari_ve_Kurulum_Notlari.md`
§5 for when to run it in a production install.
