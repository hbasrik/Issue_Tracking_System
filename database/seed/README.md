# Seed Data

Reference data scripts for local development. Run them after migrations in
the following order:

- `01_stations.sql`
- `02_stations_and_steps.sql`
- `03_checklist_templates.sql`
- `04_users.sql`
- `06_test_vehicles.sql` — **DEV/TEST DATA ONLY.** 18 fixture vehicles
  covering every station / EoL / issue state. Never apply in production.

Roles and permissions are inserted by migration `0002_v2_architecture`
(Section 11); no separate `05_permissions.sql` is required.

Load order matters due to foreign key dependencies.

From the repository root, run all scripts with:

```sh
make seed
```
