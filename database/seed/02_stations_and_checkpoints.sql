-- One production station per phase.
INSERT INTO stations (name, phase_number)
SELECT seed.name, seed.phase_number
FROM (
    VALUES
        ('Body and Frame Station', 1::SMALLINT),
        ('Paint Preparation Station', 2::SMALLINT),
        ('Chassis Assembly Station', 3::SMALLINT),
        ('High Voltage System Station', 4::SMALLINT),
        ('Interior Assembly Station', 5::SMALLINT),
        ('Exterior Assembly Station', 6::SMALLINT),
        ('Electrical Integration Station', 7::SMALLINT),
        ('Final Assembly Station', 8::SMALLINT)
) AS seed(name, phase_number)
WHERE NOT EXISTS (
    SELECT 1
    FROM stations existing
    WHERE existing.name = seed.name
      AND existing.phase_number = seed.phase_number
);

-- Eight checkpoints per phase (64 total).
WITH checkpoint_seed (phase_number, sequence_no, station_name, checkpoint_name) AS (
    VALUES
        (1::SMALLINT, 1::SMALLINT, 'Body and Frame Station', 'Underbody dimensional inspection'),
        (1, 2, 'Body and Frame Station', 'Front frame rail alignment'),
        (1, 3, 'Body and Frame Station', 'Rear frame rail alignment'),
        (1, 4, 'Body and Frame Station', 'Body weld integrity inspection'),
        (1, 5, 'Body and Frame Station', 'Door aperture geometry check'),
        (1, 6, 'Body and Frame Station', 'Roof panel attachment check'),
        (1, 7, 'Body and Frame Station', 'Corrosion protection application'),
        (1, 8, 'Body and Frame Station', 'Body identification verification'),

        (2, 1, 'Paint Preparation Station', 'Body surface cleaning'),
        (2, 2, 'Paint Preparation Station', 'Seam sealer application'),
        (2, 3, 'Paint Preparation Station', 'Primer coverage inspection'),
        (2, 4, 'Paint Preparation Station', 'Base coat color verification'),
        (2, 5, 'Paint Preparation Station', 'Clear coat coverage inspection'),
        (2, 6, 'Paint Preparation Station', 'Paint thickness measurement'),
        (2, 7, 'Paint Preparation Station', 'Surface defect inspection'),
        (2, 8, 'Paint Preparation Station', 'Paint curing verification'),

        (3, 1, 'Chassis Assembly Station', 'Front suspension installation'),
        (3, 2, 'Chassis Assembly Station', 'Rear suspension installation'),
        (3, 3, 'Chassis Assembly Station', 'Steering rack torque verification'),
        (3, 4, 'Chassis Assembly Station', 'Brake line routing inspection'),
        (3, 5, 'Chassis Assembly Station', 'Brake caliper torque verification'),
        (3, 6, 'Chassis Assembly Station', 'Wheel hub installation'),
        (3, 7, 'Chassis Assembly Station', 'Underbody shield installation'),
        (3, 8, 'Chassis Assembly Station', 'Chassis fastener audit'),

        (4, 1, 'High Voltage System Station', 'Battery pack identity verification'),
        (4, 2, 'High Voltage System Station', 'Battery pack mounting torque'),
        (4, 3, 'High Voltage System Station', 'High voltage cable routing'),
        (4, 4, 'High Voltage System Station', 'High voltage connector lock check'),
        (4, 5, 'High Voltage System Station', 'Drive unit installation'),
        (4, 6, 'High Voltage System Station', 'Inverter connection inspection'),
        (4, 7, 'High Voltage System Station', 'Cooling circuit leak test'),
        (4, 8, 'High Voltage System Station', 'Electrical isolation test'),

        (5, 1, 'Interior Assembly Station', 'Instrument panel installation'),
        (5, 2, 'Interior Assembly Station', 'Seat installation and torque check'),
        (5, 3, 'Interior Assembly Station', 'Seat belt installation check'),
        (5, 4, 'Interior Assembly Station', 'Carpet and trim fit inspection'),
        (5, 5, 'Interior Assembly Station', 'Center console installation'),
        (5, 6, 'Interior Assembly Station', 'Headliner fit inspection'),
        (5, 7, 'Interior Assembly Station', 'Airbag connector verification'),
        (5, 8, 'Interior Assembly Station', 'Interior visual quality inspection'),

        (6, 1, 'Exterior Assembly Station', 'Windshield installation inspection'),
        (6, 2, 'Exterior Assembly Station', 'Rear glass installation inspection'),
        (6, 3, 'Exterior Assembly Station', 'Door installation and alignment'),
        (6, 4, 'Exterior Assembly Station', 'Hood alignment inspection'),
        (6, 5, 'Exterior Assembly Station', 'Liftgate alignment inspection'),
        (6, 6, 'Exterior Assembly Station', 'Exterior lighting installation'),
        (6, 7, 'Exterior Assembly Station', 'Mirror installation inspection'),
        (6, 8, 'Exterior Assembly Station', 'Weather seal installation check'),

        (7, 1, 'Electrical Integration Station', 'Low voltage battery connection'),
        (7, 2, 'Electrical Integration Station', 'Vehicle control unit programming'),
        (7, 3, 'Electrical Integration Station', 'Infotainment software installation'),
        (7, 4, 'Electrical Integration Station', 'Driver assistance calibration'),
        (7, 5, 'Electrical Integration Station', 'Lighting function test'),
        (7, 6, 'Electrical Integration Station', 'Communication bus diagnostic'),
        (7, 7, 'Electrical Integration Station', 'Charging system function test'),
        (7, 8, 'Electrical Integration Station', 'Diagnostic trouble code scan'),

        (8, 1, 'Final Assembly Station', 'Wheel and tire installation'),
        (8, 2, 'Final Assembly Station', 'Wheel alignment verification'),
        (8, 3, 'Final Assembly Station', 'Fluid level inspection'),
        (8, 4, 'Final Assembly Station', 'Brake system function test'),
        (8, 5, 'Final Assembly Station', 'Steering system function test'),
        (8, 6, 'Final Assembly Station', 'Water ingress test'),
        (8, 7, 'Final Assembly Station', 'Final torque audit'),
        (8, 8, 'Final Assembly Station', 'Production completion inspection')
)
INSERT INTO checkpoints (
    phase_number,
    station_id,
    sequence_no,
    name,
    is_active
)
SELECT
    seed.phase_number,
    station.id,
    seed.sequence_no,
    seed.checkpoint_name,
    TRUE
FROM checkpoint_seed seed
JOIN stations station
  ON station.name = seed.station_name
 AND station.phase_number = seed.phase_number
ON CONFLICT (phase_number, sequence_no) DO UPDATE
SET station_id = EXCLUDED.station_id,
    name = EXCLUDED.name,
    is_active = EXCLUDED.is_active;
