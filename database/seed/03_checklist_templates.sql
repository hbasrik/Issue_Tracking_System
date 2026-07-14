-- Populate the default EoL and shipment templates created by the initial migration.
WITH template_items (template_name, item_no, item_text) AS (
    VALUES
        ('Default EoL Template (13 items)', 1::SMALLINT, 'Verify exterior paint finish and color consistency'),
        ('Default EoL Template (13 items)', 2, 'Inspect body panel gaps and flushness'),
        ('Default EoL Template (13 items)', 3, 'Verify door, hood, and liftgate operation'),
        ('Default EoL Template (13 items)', 4, 'Perform door and window seal leak test'),
        ('Default EoL Template (13 items)', 5, 'Verify headlamp, tail lamp, and signal operation'),
        ('Default EoL Template (13 items)', 6, 'Test horn, wipers, washers, and exterior controls'),
        ('Default EoL Template (13 items)', 7, 'Inspect interior trim, seats, and restraint systems'),
        ('Default EoL Template (13 items)', 8, 'Run infotainment and instrument cluster function test'),
        ('Default EoL Template (13 items)', 9, 'Complete diagnostic trouble code scan'),
        ('Default EoL Template (13 items)', 10, 'Verify charging port and high voltage charging function'),
        ('Default EoL Template (13 items)', 11, 'Perform warehouse tire pressure and wheel inspection'),
        ('Default EoL Template (13 items)', 12, 'Perform warehouse fluid and visible leak inspection'),
        ('Default EoL Template (13 items)', 13, 'Complete warehouse final quality release inspection'),

        ('Default Shipment Template (43 items)', 1, 'Verify VIN against production and shipment records'),
        ('Default Shipment Template (43 items)', 2, 'Verify vehicle model, variant, and market specification'),
        ('Default Shipment Template (43 items)', 3, 'Confirm vehicle software release version'),
        ('Default Shipment Template (43 items)', 4, 'Confirm all production checkpoints are recorded'),
        ('Default Shipment Template (43 items)', 5, 'Confirm no critical diagnostic trouble codes are active'),
        ('Default Shipment Template (43 items)', 6, 'Confirm all required campaigns and updates are complete'),
        ('Default Shipment Template (43 items)', 7, 'Inspect front bumper finish and attachment'),
        ('Default Shipment Template (43 items)', 8, 'Inspect rear bumper finish and attachment'),
        ('Default Shipment Template (43 items)', 9, 'Inspect hood surface and alignment'),
        ('Default Shipment Template (43 items)', 10, 'Inspect roof surface and glass'),
        ('Default Shipment Template (43 items)', 11, 'Inspect left body side paint and panels'),
        ('Default Shipment Template (43 items)', 12, 'Inspect right body side paint and panels'),
        ('Default Shipment Template (43 items)', 13, 'Inspect liftgate or trunk finish and alignment'),
        ('Default Shipment Template (43 items)', 14, 'Inspect exterior mirrors and camera lenses'),
        ('Default Shipment Template (43 items)', 15, 'Inspect windshield and window glass'),
        ('Default Shipment Template (43 items)', 16, 'Verify all door seals are seated correctly'),
        ('Default Shipment Template (43 items)', 17, 'Verify driver door lock and release operation'),
        ('Default Shipment Template (43 items)', 18, 'Verify passenger door lock and release operation'),
        ('Default Shipment Template (43 items)', 19, 'Verify rear door lock and release operation'),
        ('Default Shipment Template (43 items)', 20, 'Verify hood and liftgate latch operation'),
        ('Default Shipment Template (43 items)', 21, 'Verify headlamp low and high beam operation'),
        ('Default Shipment Template (43 items)', 22, 'Verify daytime running lamp operation'),
        ('Default Shipment Template (43 items)', 23, 'Verify turn signal and hazard lamp operation'),
        ('Default Shipment Template (43 items)', 24, 'Verify brake and reverse lamp operation'),
        ('Default Shipment Template (43 items)', 25, 'Verify interior and cargo lamp operation'),
        ('Default Shipment Template (43 items)', 26, 'Verify horn, wiper, and washer operation'),
        ('Default Shipment Template (43 items)', 27, 'Verify power window and mirror operation'),
        ('Default Shipment Template (43 items)', 28, 'Verify seat adjustment and heating functions'),
        ('Default Shipment Template (43 items)', 29, 'Verify seat belt condition and warning indicators'),
        ('Default Shipment Template (43 items)', 30, 'Inspect dashboard, console, and interior trim'),
        ('Default Shipment Template (43 items)', 31, 'Verify climate control heating and cooling'),
        ('Default Shipment Template (43 items)', 32, 'Verify infotainment display and audio output'),
        ('Default Shipment Template (43 items)', 33, 'Verify Bluetooth, navigation, and connectivity'),
        ('Default Shipment Template (43 items)', 34, 'Verify instrument cluster indicators and messages'),
        ('Default Shipment Template (43 items)', 35, 'Verify rear view camera and parking sensors'),
        ('Default Shipment Template (43 items)', 36, 'Verify charging cable and accessory equipment'),
        ('Default Shipment Template (43 items)', 37, 'Verify charging port door and connector condition'),
        ('Default Shipment Template (43 items)', 38, 'Verify high voltage battery state of charge'),
        ('Default Shipment Template (43 items)', 39, 'Inspect wheels, tires, and tire pressures'),
        ('Default Shipment Template (43 items)', 40, 'Inspect underbody for damage or fluid leaks'),
        ('Default Shipment Template (43 items)', 41, 'Verify owner documents, labels, and manuals'),
        ('Default Shipment Template (43 items)', 42, 'Remove production protection and clean vehicle'),
        ('Default Shipment Template (43 items)', 43, 'Complete final shipment release approval')
)
INSERT INTO checklist_template_items (
    template_id,
    item_no,
    item_text,
    is_active
)
SELECT
    template.id,
    seed.item_no,
    seed.item_text,
    TRUE
FROM template_items seed
JOIN checklist_templates template
  ON template.name = seed.template_name
 AND template.vehicle_model_id IS NULL
ON CONFLICT (template_id, item_no) DO UPDATE
SET item_text = EXCLUDED.item_text,
    is_active = EXCLUDED.is_active;
