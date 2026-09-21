# Seed Data

Reference data scripts for local development. Run them after migrations in
the following order:

- `01_stations.sql`
- `02_stations_and_steps.sql`
- `03_checklist_templates.sql` — real shop-floor checklist items (EOL /
  SHIPMENT / TEST) exported from production content; idempotent
  `ON CONFLICT (template_id, item_no) DO UPDATE`
- `04_users.sql`
- `05_defect_catalog.sql` — defect zones / parts / types / processes
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

## 500 VIN load (not part of `make seed`)

Bulk PLANNED VIN import lives at
`database/scripts/reset_and_load_vins.sql`. It truncates operational
vehicle data and inserts 500 VINs; see `docs/09_KAREA_DB_Mimari_ve_Kurulum_Notlari.md`
§5 for when to run it in a production install.
