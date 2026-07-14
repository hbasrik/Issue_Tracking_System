# Seed Data

Reference data scripts for local development. Run them after migrations in
the following order:

- `01_phases.sql`
- `02_stations_and_checkpoints.sql`
- `03_checklist_templates.sql`
- `04_users.sql`

Load order matters due to foreign key dependencies.

From the repository root, run all scripts with:

```sh
make seed
```
