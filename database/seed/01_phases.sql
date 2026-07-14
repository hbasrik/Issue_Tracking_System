-- Keep the eight production phases consistent with the initial migration.
-- ON CONFLICT makes this seed safe after the migration's reference insert.
INSERT INTO phases (phase_number, name) VALUES
    (1, 'Phase 1'),
    (2, 'Phase 2'),
    (3, 'Phase 3'),
    (4, 'Phase 4'),
    (5, 'Phase 5'),
    (6, 'Phase 6'),
    (7, 'Phase 7'),
    (8, 'Phase 8')
ON CONFLICT (phase_number) DO UPDATE
SET name = EXCLUDED.name;
