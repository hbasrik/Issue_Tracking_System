-- Eight station steps per station (64 total). Same content as the former
-- checkpoints seed, remapped onto station_steps.
WITH step_seed (sequence_no, station_name, step_name) AS (
    VALUES
        (1::SMALLINT, 'Body and Frame Station', 'Underbody dimensional inspection'),
        (2, 'Body and Frame Station', 'Front frame rail alignment'),
        (3, 'Body and Frame Station', 'Rear frame rail alignment'),
        (4, 'Body and Frame Station', 'Body weld integrity inspection'),
        (5, 'Body and Frame Station', 'Door aperture geometry check'),
        (6, 'Body and Frame Station', 'Roof panel attachment check'),
        (7, 'Body and Frame Station', 'Corrosion protection application'),
        (8, 'Body and Frame Station', 'Body identification verification'),

        (1, 'Paint Preparation Station', 'Body surface cleaning'),
        (2, 'Paint Preparation Station', 'Seam sealer application'),
        (3, 'Paint Preparation Station', 'Primer coverage inspection'),
        (4, 'Paint Preparation Station', 'Base coat color verification'),
        (5, 'Paint Preparation Station', 'Clear coat coverage inspection'),
        (6, 'Paint Preparation Station', 'Paint thickness measurement'),
        (7, 'Paint Preparation Station', 'Surface defect inspection'),
        (8, 'Paint Preparation Station', 'Paint curing verification'),

        (1, 'Chassis Assembly Station', 'Front suspension installation'),
        (2, 'Chassis Assembly Station', 'Rear suspension installation'),
        (3, 'Chassis Assembly Station', 'Steering rack torque verification'),
        (4, 'Chassis Assembly Station', 'Brake line routing inspection'),
        (5, 'Chassis Assembly Station', 'Brake caliper torque verification'),
        (6, 'Chassis Assembly Station', 'Wheel hub installation'),
        (7, 'Chassis Assembly Station', 'Underbody shield installation'),
        (8, 'Chassis Assembly Station', 'Chassis fastener audit'),

        (1, 'High Voltage System Station', 'Battery pack identity verification'),
        (2, 'High Voltage System Station', 'Battery pack mounting torque'),
        (3, 'High Voltage System Station', 'High voltage cable routing'),
        (4, 'High Voltage System Station', 'High voltage connector lock check'),
        (5, 'High Voltage System Station', 'Drive unit installation'),
        (6, 'High Voltage System Station', 'Inverter connection inspection'),
        (7, 'High Voltage System Station', 'Cooling circuit leak test'),
        (8, 'High Voltage System Station', 'Electrical isolation test'),

        (1, 'Interior Assembly Station', 'Instrument panel installation'),
        (2, 'Interior Assembly Station', 'Seat installation and torque check'),
        (3, 'Interior Assembly Station', 'Seat belt installation check'),
        (4, 'Interior Assembly Station', 'Carpet and trim fit inspection'),
        (5, 'Interior Assembly Station', 'Center console installation'),
        (6, 'Interior Assembly Station', 'Headliner fit inspection'),
        (7, 'Interior Assembly Station', 'Airbag connector verification'),
        (8, 'Interior Assembly Station', 'Interior visual quality inspection'),

        (1, 'Exterior Assembly Station', 'Windshield installation inspection'),
        (2, 'Exterior Assembly Station', 'Rear glass installation inspection'),
        (3, 'Exterior Assembly Station', 'Door installation and alignment'),
        (4, 'Exterior Assembly Station', 'Hood alignment inspection'),
        (5, 'Exterior Assembly Station', 'Liftgate alignment inspection'),
        (6, 'Exterior Assembly Station', 'Exterior lighting installation'),
        (7, 'Exterior Assembly Station', 'Mirror installation inspection'),
        (8, 'Exterior Assembly Station', 'Weather seal installation check'),

        (1, 'Electrical Integration Station', 'Low voltage battery connection'),
        (2, 'Electrical Integration Station', 'Vehicle control unit programming'),
        (3, 'Electrical Integration Station', 'Infotainment software installation'),
        (4, 'Electrical Integration Station', 'Driver assistance calibration'),
        (5, 'Electrical Integration Station', 'Lighting function test'),
        (6, 'Electrical Integration Station', 'Communication bus diagnostic'),
        (7, 'Electrical Integration Station', 'Charging system function test'),
        (8, 'Electrical Integration Station', 'Diagnostic trouble code scan'),

        (1, 'Final Assembly Station', 'Wheel and tire installation'),
        (2, 'Final Assembly Station', 'Wheel alignment verification'),
        (3, 'Final Assembly Station', 'Fluid level inspection'),
        (4, 'Final Assembly Station', 'Brake system function test'),
        (5, 'Final Assembly Station', 'Steering system function test'),
        (6, 'Final Assembly Station', 'Water ingress test'),
        (7, 'Final Assembly Station', 'Final torque audit'),
        (8, 'Final Assembly Station', 'Production completion inspection')
)
INSERT INTO station_steps (
    station_id,
    sequence_no,
    name,
    is_active
)
SELECT
    station.id,
    seed.sequence_no,
    seed.step_name,
    TRUE
FROM step_seed seed
JOIN stations station
  ON station.name = seed.station_name
ON CONFLICT (station_id, sequence_no) DO UPDATE
SET name = EXCLUDED.name,
    is_active = EXCLUDED.is_active;
