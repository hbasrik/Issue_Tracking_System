-- Eight production stations (replaces v1 phases). Migration 0002 inserts
-- placeholder Station 1..8; this seed renames them to the production labels.
-- Matched on sequence_no (no code path renumbers stations). Only a row that
-- still carries its untouched 'Station N' placeholder name is renamed; any
-- other existing row is left as it is, and is_active is never written.
INSERT INTO stations (name, sequence_no, is_active) VALUES
    ('Body and Frame Station', 1, TRUE),
    ('Paint Preparation Station', 2, TRUE),
    ('Chassis Assembly Station', 3, TRUE),
    ('High Voltage System Station', 4, TRUE),
    ('Interior Assembly Station', 5, TRUE),
    ('Exterior Assembly Station', 6, TRUE),
    ('Electrical Integration Station', 7, TRUE),
    ('Final Assembly Station', 8, TRUE)
ON CONFLICT (sequence_no) DO UPDATE
SET name = EXCLUDED.name
WHERE stations.name = 'Station ' || stations.sequence_no;
