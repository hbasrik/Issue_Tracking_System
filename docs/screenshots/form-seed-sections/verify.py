#!/usr/bin/env python3
"""Kept EOL items in their own sections + seed 06 findings on matching items
(docs/16 A55, Karar 30). Test databases only; live is never touched.

1. karea_sections_test, production path: every migration, seeds 01, 02, 03,
   05, then database/scripts/reset_and_load_vins.sql.
   - every EOL item has a catalog section; no unsectioned item
   - kept 7 branch items in eol_physical_tests (60), Bumpy Road and Yağmur
     Testi in final_extra_checks (200); text and md5 seed_key unchanged
   - TR / EN titles for every section
   - seed 03 run a second time changes nothing
   Dropped at the end.
2. karea_eolnote_test (every migration + seeds 01-06; built here): every
   fixture issue listed with the text of the item / step it is attached to,
   and the vehicle scenarios the fixtures exist for. Kept for capture.mjs;
   drop with eol-note/run-verification.py drop.
"""
import glob
import re
import subprocess
import sys

ROOT = "/Users/Basri/Desktop/kts_kms_project"
PSQL = "/opt/homebrew/opt/libpq/bin/psql"
URL = "postgres://karea:karea_secret@localhost:5432/{db}?sslmode=disable"
PROD_DB = "karea_sections_test"
DEV_DB = "karea_eolnote_test"
EOL = "Default EoL Template (Branch + Depot)"
PHYSICAL = ["Araç Motoru", "Batarya", "Süspansiyon Testi", "Fren/El Testi", "Far Ayarı", "Rot Balans", "Sürüş"]
EXTRA = ["Bumpy Road", "Yağmur Testi"]

failures = []


def db(name, sql=None, file=None):
    cmd = [PSQL, URL.format(db=name), "-X", "-q", "-v", "ON_ERROR_STOP=1", "-At", "-F", "\t"]
    cmd += ["-f", file] if file else ["-c", sql]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit(f"psql failed: {r.stderr.strip()}")
    return r.stdout.strip()


def check(label, ok, detail=""):
    print(f"  [{'PASS' if ok else 'FAIL'}] {label}" + (f" — {detail}" if detail else ""))
    if not ok:
        failures.append(label)


def rows(text):
    return [line.split("\t") for line in text.splitlines()] if text else []


def build(name, seeds, vins):
    db("postgres", f"DROP DATABASE IF EXISTS {name};")
    db("postgres", f"CREATE DATABASE {name};")
    migs = sorted(glob.glob(f"{ROOT}/database/migrations/*.up.sql"))
    for f in migs:
        db(name, file=f)
    for s in seeds:
        db(name, file=f"{ROOT}/database/seed/{s}")
    if vins:
        db(name, file=f"{ROOT}/database/scripts/reset_and_load_vins.sql")
    print(f"  built {name}: {len(migs)} migrations (last {migs[-1].rsplit('/', 1)[1]}), seeds {', '.join(seeds)}"
          + (", reset_and_load_vins.sql" if vins else ""))


msgs = open(f"{ROOT}/shared/i18n/messages.ts", encoding="utf-8").read()
tr_part, en_part = msgs.split("export const en", 1)
msg_tr = dict(re.findall(r"'(checklist\.section\.[a-z0-9_]+)': '([^']*)'", tr_part))
msg_en = dict(re.findall(r"'(checklist\.section\.[a-z0-9_]+)': '([^']*)'", en_part))
catalog_src = open(f"{ROOT}/shared/checklistSections.ts", encoding="utf-8").read()
eol_src = catalog_src.split("EOL_CHECKLIST_SECTIONS: ChecklistSectionCatalogEntry[] = [", 1)[1].split("];", 1)[0]
catalog = [(k, int(s), t) for k, s, t in
           re.findall(r"key: '([a-z0-9_]+)', sort: (\d+), titleKey: '([a-z._0-9]+)'", eol_src)]
cat_sort = {k: s for k, s, _ in catalog}
title_tr = {k: msg_tr.get(t) for k, _, t in catalog}
title_en = {k: msg_en.get(t) for k, _, t in catalog}

# ---------------------------------------------------------------- 1. production path
print(f"== 1. {PROD_DB}: production path")
build(PROD_DB, ["01_stations.sql", "02_stations_and_steps.sql", "03_checklist_templates.sql",
                "05_defect_catalog.sql"], vins=True)
items = rows(db(PROD_DB, f"""
    select i.item_no, i.eol_phase, coalesce(i.section_key, ''), coalesce(i.section_sort::text, ''),
           i.item_text, i.seed_key, coalesce(i.form_code, '-')
    from checklist_template_items i join checklist_templates t on t.id = i.template_id
    where t.name = '{EOL}' and t.vehicle_model_id is null
    order by i.item_no"""))
check("EOL template has 104 items", len(items) == 104, str(len(items)))
unsectioned = [r[0] for r in items if not r[2]]
check("every EOL item has a section (no 'Other items' group)", not unsectioned,
      ", ".join(unsectioned) or "none")
bad = [f"{r[0]} {r[2]}={r[3]}" for r in items if r[2] and cat_sort.get(r[2]) != int(r[3] or -1)]
check("every section key and sort equals the catalog", not bad, ", ".join(bad) or "none")

print("\n-- sections (sort | key | phase | items | tr | en)")
secs = rows(db(PROD_DB, f"""
    select i.section_sort, i.section_key, string_agg(distinct i.eol_phase::text, ','), min(i.item_no),
           max(i.item_no), count(*)
    from checklist_template_items i join checklist_templates t on t.id = i.template_id
    where t.name = '{EOL}' group by 1, 2 order by 1"""))
for s in secs:
    print(f"  {s[0]:>3} | {s[1]:<18} | {s[2]:<6} | {s[3]}-{s[4]} ({s[5]}) | {title_tr.get(s[1])} | {title_en.get(s[1])}")
check("section order equals catalog order", [s[1] for s in secs] == [k for k, _, _ in catalog],
      " > ".join(s[1] for s in secs))
check("every section has a TR and EN title", all(title_tr.get(s[1]) and title_en.get(s[1]) for s in secs))

print("\n-- kept 9 pre-form items")
kept = {r[4]: r for r in items if r[4] in PHYSICAL + EXTRA}
md5s = dict(rows(db(PROD_DB, "select t, md5(t) from unnest(array["
                    + ",".join(f"'{x}'" for x in PHYSICAL + EXTRA) + "]) t")))
for n in PHYSICAL + EXTRA:
    r = kept[n]
    print(f"  {r[0]:>3} {r[1]:<6} {r[2]:<18} {r[3]:>3} {n:<18} seed_key={r[5]} = md5(text): {r[5] == md5s[n]}")
check("7 branch items in eol_physical_tests (60), item_no 40-46",
      [(kept[n][0], kept[n][1], kept[n][2], kept[n][3]) for n in PHYSICAL]
      == [(str(40 + i), "BRANCH", "eol_physical_tests", "60") for i in range(7)])
check("Bumpy Road + Yağmur Testi in final_extra_checks (200), item_no 103-104",
      [(kept[n][0], kept[n][1], kept[n][2], kept[n][3]) for n in EXTRA]
      == [("103", "DEPOT", "final_extra_checks", "200"), ("104", "DEPOT", "final_extra_checks", "200")])
check("kept items keep md5(text) seed_key and no form", all(kept[n][5] == md5s[n] and kept[n][6] == "-"
                                                            for n in PHYSICAL + EXTRA))
check("Bumpy Road not in Yol Testi", kept["Bumpy Road"][2] != "final_road_test")

print("\n-- seed 03 run a second time")
fp = ("select count(*) || ' items md5 ' || md5(string_agg(concat_ws(',', id, template_id, item_no, item_text, "
      "eol_phase, section_key, section_sort, seed_key, form_code, form_item_ref, acceptance_criterion, "
      "control_method, is_active), '|' order by id)) from checklist_template_items")
before = db(PROD_DB, fp)
db(PROD_DB, file=f"{ROOT}/database/seed/03_checklist_templates.sql")
after = db(PROD_DB, fp)
print(f"  before: {before}\n  after:  {after}")
check("second run adds and changes nothing", before == after)
dist = db(PROD_DB, "select string_agg(n || ' rows x ' || c || ' vins', ', ') from (select n, count(*) c from "
                   "(select vin, count(*) n from checklist_item_progress where checklist_type = 'EOL' group by vin) x "
                   "group by n) y")
check("every loaded VIN has 104 EOL progress rows", dist == "104 rows x 500 vins", dist)
db("postgres", f"DROP DATABASE {PROD_DB};")
print(f"  dropped {PROD_DB}")

# ---------------------------------------------------------------- 2. seed 06 fixtures
print(f"\n== 2. {DEV_DB}: seed 06 findings and the items they sit on")
build(DEV_DB, ["01_stations.sql", "02_stations_and_steps.sql", "03_checklist_templates.sql",
               "04_users.sql", "05_defect_catalog.sql", "06_test_vehicles.sql"], vins=False)
issues = rows(db(DEV_DB, """
    select right(v.vin, 6), il.vin, il.source_type, il.severity, il.status,
           coalesce(cti.item_no::text, s.sequence_no || '/' || ss.sequence_no),
           coalesce(ct.type::text, 'STATION'), coalesce(cti.eol_phase::text, ''),
           coalesce(cti.section_key, ''), coalesce(cti.item_text, ss.name), il.description,
           coalesce(p.check_status::text, ''),
           coalesce(p.rejected_desc, p.conditional_desc, p.rework_desc, p.approved_desc, ''),
           coalesce(il.solution_description, '')
    from issue_list il
    join vehicles v on v.vin = il.vin
    left join checklist_template_items cti on cti.id = il.source_check_item_id
    left join checklist_templates ct on ct.id = cti.template_id
    left join checklist_item_progress p on p.vin = il.vin and p.check_item_id = cti.id
    left join station_steps ss on ss.id = il.source_station_step_id
    left join stations s on s.id = ss.station_id
    order by right(v.vin, 6), il.id"""))
for r in issues:
    loc = f"{r[6]} {r[7]} #{r[5]}".replace("  ", " ")
    print(f"\n  {r[0]} {r[1]} {r[2]} {r[3]} {r[4]}")
    print(f"     item:     {loc} [{r[8] or '-'}] \"{r[9]}\"")
    print(f"     issue:    {r[10]}")
    if r[11]:
        print(f"     answer:   {r[11]} \"{r[12]}\"")
    if r[13]:
        print(f"     solution: {r[13]}")
check("16 fixture issues (4 station + 12 checklist)", len(issues) == 16 and
      sum(r[2] == "STATION_STEP" for r in issues) == 4, str(len(issues)))
want = {
    ("N7V1K1SA2TK000004", "STATION"): "High voltage connector lock check",
    ("N7V1K1SA4TK000005", "STATION"): "Seat installation and torque check",
    ("N7V1K1SA6TK000006", "STATION"): "Windshield installation inspection",
    ("N7V1K1SA8TK000010", "STATION"): "Surface defect inspection",
}
for (vin, kind), name in want.items():
    hit = [r for r in issues if r[1] == vin and r[6] == kind]
    check(f"{vin} station issue on '{name}'", len(hit) == 1 and hit[0][9] == name, hit[0][9] if hit else "-")
expect_items = {
    "Left door seal not seated; water ingress risk.": "Sol kapı contası",
    "Driver seat belt twisted at the B-pillar anchor.": "Sol / sağ emniyet kemeri ve askıları",
    "Abnormal drive-motor noise during branch EoL.": "Araç Motoru",
    "C-pillar stop tabs left uncut on the left side.": "C_Pillar Stop tırnaklarının kesilmesi",
    "Dynamic service brake performance outside spec.": "Fren — 30",
    "Accessory pack missing one wheel chock.": "Anahtar, uzaktan kumanda ve aksesuar seti tam",
    "Rear-view camera image dropped out on first R selection.": "Geri görüş kamerası",
    "Left rear wheel-arch liner not trimmed at the brake line; liner touches the pipe.":
        "Arka davlumbaz sol fren borusu girişim bölgesi kesimi",
    "Brake fluid leak found during depot inspection.": "Fren hortum ve hatlarında sıvı kaçağı yok",
    "OBD scan shows active drive-motor DTC at depot.": "DTC / Diyagnostik tarama",
    "Right quarter-glass foam shorter than specified.": "Kelebek camı düşmemesi için sünger konulması",
    "Left headlamp aim out of spec during test.": "Dış aydınlatma",
}
for desc, text in expect_items.items():
    hit = [r for r in issues if r[10] == desc]
    check(f"'{desc[:44]}' on '{text[:40]}'", len(hit) == 1 and hit[0][9].startswith(text),
          hit[0][9][:60] if hit else "missing")

print("\n-- scenarios the fixtures exist for")
scen = rows(db(DEV_DB, """
    select right(v.vin, 6), w.vin, w.current_stage,
           (select count(*) from issue_list il where il.vin = w.vin
              and il.status in ('OPEN', 'IN_PROGRESS', 'DONE'))
    from vehicle_eol_workflow w join vehicles v on v.vin = w.vin
    where w.vin in ('N7V1K1SA8TK000007', 'N7V1K1SAXTK000008', 'N7V1K1SA1TK000009', 'N7V1K1SA8TK000010',
                    'N7V1K1SAXTK000011', 'N7V1K1SA1TK000012', 'N7V1K1SA3TK000013')
    order by right(v.vin, 6)"""))
for s in scen:
    print(f"  {s[0]} {s[1]} stage={s[2]} unresolved issues={s[3]}")
stage = {s[1]: (s[2], int(s[3])) for s in scen}
check("10051 at DEPOT with no unresolved issue (depot-release passes)",
      stage["N7V1K1SA8TK000010"] == ("DEPOT", 0), str(stage["N7V1K1SA8TK000010"]))
check("10053 at DEPOT with an OPEN CRITICAL depot finding (depot-release blocked)",
      stage["N7V1K1SA1TK000012"][0] == "DEPOT"
      and any(r[1] == "N7V1K1SA1TK000012" and r[3] == "CRITICAL" and r[4] == "OPEN" and r[7] == "DEPOT"
              for r in issues))
check("10048 at BRANCH with OPEN + IN_PROGRESS branch findings (branch-ship warning)",
      stage["N7V1K1SA8TK000007"] == ("BRANCH", 2), str(stage["N7V1K1SA8TK000007"]))

print("\nRESULT:", "ALL PASS" if not failures else f"{len(failures)} FAIL: {failures}")
sys.exit(1 if failures else 0)
