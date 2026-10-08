#!/usr/bin/env python3
"""Form item seed verification (docs/16 A55). Test databases only; live is
read once as karea_ro (SELECT) to compare the 9 kept EOL items.

1. karea_formseed_test, production path: every migration, seeds 01, 02, 03,
   05 (no 04 / 06), then database/scripts/reset_and_load_vins.sql.
   - 104 EOL items: template, phase, order, sections
   - every form item field against docs/21 (parsed here independently)
   - kept 9: text and seed_key equal to live
   - seed 03 run a second time adds nothing
   - every loaded VIN has a progress row per active EOL item
2. karea_eolnote_test (built by eol-note/run-verification.py db, seeds 01-06):
   0040 on a delivered vehicle — PENDING insert passes, answered insert and
   answering the PENDING row are refused. Uses rows marked 'tmp-formseed' and
   deletes them.
karea_formseed_test is dropped at the end.
"""
import glob
import re
import subprocess
import sys

ROOT = "/Users/Basri/Desktop/kts_kms_project"
PSQL = "/opt/homebrew/opt/libpq/bin/psql"
URL = "postgres://karea:karea_secret@localhost:5432/{db}?sslmode=disable"
LIVE = "postgres://karea_ro@localhost:5432/karea?sslmode=disable"
PROD_DB = "karea_formseed_test"
DEV_DB = "karea_eolnote_test"
EOL = "Default EoL Template (Branch + Depot)"
KEPT = ["Araç Motoru", "Batarya", "Süspansiyon Testi", "Fren/El Testi", "Far Ayarı",
        "Rot Balans", "Sürüş", "Bumpy Road", "Yağmur Testi"]
REMOVED = ["Software Update", "Fonksiyonel Komponet Kontrolü", "EE Check", "Görsel Kontrol",
           "Görsel Kontrol 2", "Depo Sürüş"]

failures = []


def run(url, sql=None, file=None, ok_fail=False):
    cmd = [PSQL, url, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-At", "-F", "\t"]
    cmd += ["-f", file] if file else ["-c", sql]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0 and not ok_fail:
        raise SystemExit(f"psql failed: {r.stderr.strip()}")
    return (r.returncode, r.stdout.strip(), r.stderr.strip()) if ok_fail else r.stdout.strip()


def db(name, sql=None, file=None, ok_fail=False):
    return run(URL.format(db=name), sql, file, ok_fail)


def check(label, ok, detail=""):
    print(f"  [{'PASS' if ok else 'FAIL'}] {label}" + (f" — {detail}" if detail else ""))
    if not ok:
        failures.append(label)


def rows(text):
    return [line.split("\t") for line in text.splitlines()] if text else []


# ---------------------------------------------------------------- docs/21
doc = open(f"{ROOT}/docs/21_KAREA_Yeni_Formlar.md", encoding="utf-8").read()


def doc_table(heading):
    part = doc.split(heading, 1)[1].split("\n## ", 1)[0]
    out = []
    for line in part.splitlines():
        if line.startswith("| ") and not line.startswith(("| ID ", "| No ")):
            out.append([c.strip() for c in line.strip().strip("|").split("|")])
    return out


expected = {}
for ref, sec, text, crit, method in doc_table("## KY.FR-09"):
    expected[f"KY.FR-09:{ref}"] = dict(code="KY.FR-09", ref=ref, section=sec, text=text,
                                       crit=crit, method=method, phase="BRANCH")
for ref, sec, text, method in doc_table("## KY.FR-19"):
    expected[f"KY.FR-19:{ref}"] = dict(code="KY.FR-19", ref=ref, section=sec, text=text,
                                       crit=None, method=method, phase="DEPOT")

msgs = open(f"{ROOT}/shared/i18n/messages.ts", encoding="utf-8").read()
tr_part, en_part = msgs.split("export const en", 1)
msg_tr = dict(re.findall(r"'(checklist\.section\.[a-z0-9_]+)': '([^']*)'", tr_part))
msg_en = dict(re.findall(r"'(checklist\.section\.[a-z0-9_]+)': '([^']*)'", en_part))
# Same resolution as the app: section_key -> catalog titleKey -> message.
catalog_src = open(f"{ROOT}/shared/checklistSections.ts", encoding="utf-8").read()
title_key = dict(re.findall(r"key: '([a-z0-9_]+)', sort: \d+, titleKey: '([a-z._0-9]+)'", catalog_src))
title_tr = {k: msg_tr[v] for k, v in title_key.items() if v in msg_tr}
title_en = {k: msg_en[v] for k, v in title_key.items() if v in msg_en}

# ---------------------------------------------------------------- 1. production path
print(f"== 1. {PROD_DB}: migrations + seeds 01, 02, 03, 05 + reset_and_load_vins.sql")
db("postgres", f"DROP DATABASE IF EXISTS {PROD_DB};")
db("postgres", f"CREATE DATABASE {PROD_DB};")
migs = sorted(glob.glob(f"{ROOT}/database/migrations/*.up.sql"))
for f in migs:
    db(PROD_DB, file=f)
for s in ["01_stations.sql", "02_stations_and_steps.sql", "03_checklist_templates.sql",
          "05_defect_catalog.sql"]:
    db(PROD_DB, file=f"{ROOT}/database/seed/{s}")
db(PROD_DB, file=f"{ROOT}/database/scripts/reset_and_load_vins.sql")
print(f"  built: {len(migs)} migrations, schema version file {migs[-1].rsplit('/', 1)[1]}")

print("\n-- templates and item counts")
print("  " + db(PROD_DB, "select string_agg(t.id || ' ' || t.type || ' \"' || t.name || '\" items=' || "
                "(select count(*) from checklist_template_items i where i.template_id = t.id), '; ' order by t.id) "
                "from checklist_templates t"))

items = rows(db(PROD_DB, f"""
    select i.item_no, i.eol_phase, coalesce(i.section_key, ''), coalesce(i.section_sort::text, ''),
           coalesce(i.form_code, ''), coalesce(i.form_item_ref, ''), i.item_text,
           coalesce(i.acceptance_criterion, '<NULL>'), coalesce(i.control_method, '<NULL>'),
           i.seed_key, i.is_active, coalesce(i.form_revision, '<NULL>'),
           coalesce(i.form_published_at::text, '<NULL>')
    from checklist_template_items i join checklist_templates t on t.id = i.template_id
    where t.name = '{EOL}' and t.vehicle_model_id is null
    order by i.item_no"""))
check("EOL template has 104 items", len(items) == 104, f"{len(items)}")
check("all active", all(r[10] == "t" for r in items))
nos = [int(r[0]) for r in items]
check("item_no 1..104 without gaps", nos == list(range(1, 105)))
check("BRANCH = item_no 1-46", {int(r[0]) for r in items if r[1] == "BRANCH"} == set(range(1, 47)))
check("DEPOT = item_no 47-104", {int(r[0]) for r in items if r[1] == "DEPOT"} == set(range(47, 105)))

print("\n-- full EOL listing (item_no | phase | section | sort | form | text)")
for r in items:
    sec = r[2] or "-"
    title = title_tr.get(r[2], "Diğer maddeler") if r[2] else "Diğer maddeler"
    form = f"{r[4]} {r[5]}" if r[4] else "-"
    print(f"  {r[0]:>3} | {r[1]:<6} | {sec:<16} {title:<16} | {r[3] or '-':>3} | {form:<13} | {r[6]}")

print("\n-- form items vs docs/21 (text, kabul kriteri, yöntem, bölüm, form_code, ref, seed_key, phase)")
by_key = {r[9]: r for r in items if r[4]}
check("95 form items", len(by_key) == 95, f"{len(by_key)}")
check("docs/21 has 95 rows (39 + 56)", len(expected) == 95, f"{len(expected)}")
diffs = []
for key, e in expected.items():
    r = by_key.get(key)
    if r is None:
        diffs.append(f"{key}: missing in DB")
        continue
    want = [("text", e["text"], r[6]), ("acceptance_criterion", e["crit"] or "<NULL>", r[7]),
            ("control_method", e["method"], r[8]), ("form_code", e["code"], r[4]),
            ("form_item_ref", e["ref"], r[5]), ("phase", e["phase"], r[1]),
            ("section title (tr)", e["section"], title_tr.get(r[2], f"<raw {r[2]}>")),
            ("form_revision", "<NULL>", r[11]), ("form_published_at", "<NULL>", r[12])]
    for field, a, b in want:
        if a != b:
            diffs.append(f"{key} {field}: docs/21={a!r} db={b!r}")
extra = set(by_key) - set(expected)
diffs += [f"{k}: in DB, not in docs/21" for k in sorted(extra)]
check("every form item equals docs/21 field by field (95 x 9 fields)", not diffs,
      f"{len(diffs)} difference(s)")
for d in diffs:
    print("     " + d)
crit_null = sum(1 for k in expected if k.startswith("KY.FR-19") and by_key[k][7] == "<NULL>")
crit_set = sum(1 for k in expected if k.startswith("KY.FR-09") and by_key[k][7] != "<NULL>")
check("KY.FR-19 acceptance_criterion NULL (Gereklilik empty)", crit_null == 56, f"{crit_null}/56")
check("KY.FR-09 acceptance_criterion filled", crit_set == 39, f"{crit_set}/39")
fr19_refs = sorted(int(e["ref"]) for e in expected.values() if e["code"] == "KY.FR-19")
check("KY.FR-19 refs 1-42, 46-59 (43-45 absent on paper)",
      fr19_refs == list(range(1, 43)) + list(range(46, 60)))

print("\n-- sections: paper order, two Dış keys, titles in both languages")
secs = rows(db(PROD_DB, f"""
    select i.section_key, i.section_sort, i.eol_phase, min(i.item_no), max(i.item_no), count(*)
    from checklist_template_items i join checklist_templates t on t.id = i.template_id
    where t.name = '{EOL}' and i.section_key is not null
    group by 1, 2, 3 order by 2"""))
for s in secs:
    print(f"  {s[1]:>3} {s[0]:<16} {s[2]:<6} items {s[3]}-{s[4]} ({s[5]}) "
          f"tr=\"{title_tr.get(s[0], '<raw>')}\" en=\"{title_en.get(s[0], '<raw>')}\"")
check("no raw section key (every key has tr + en title)",
      all(title_tr.get(s[0]) and title_en.get(s[0]) for s in secs))
check("Dış split into eol_exterior (E003-E006) and eol_exterior_2 (E011-E018)",
      [r[5] for r in items if r[2] == "eol_exterior"] == ["E003", "E004", "E005", "E006"]
      and [r[5] for r in items if r[2] == "eol_exterior_2"] == [f"E0{n}" for n in range(11, 19)])
check("section_sort follows item_no (paper order)",
      [int(r[3]) for r in items if r[3]] == sorted(int(r[3]) for r in items if r[3]))

print("\n-- kept 9 pre-form items vs live (karea_ro, SELECT only)")
names = ",".join("'" + n.replace("'", "''") + "'" for n in KEPT)
live = dict((r[0], r[1:]) for r in rows(run(LIVE, f"""
    select i.item_text, i.seed_key, i.eol_phase, i.item_no
    from checklist_template_items i join checklist_templates t on t.id = i.template_id
    where t.type = 'EOL' and t.vehicle_model_id is null and i.item_text in ({names})""")))
mine = {r[6]: r for r in items if r[6] in KEPT}
for n in KEPT:
    l, m = live.get(n), mine.get(n)
    same = l is not None and m is not None and l[0] == m[9] and l[1] == m[1]
    print(f"  {n:<18} live seed_key={l[0] if l else '-'} phase={l[1] if l else '-'} item_no={l[2] if l else '-'}"
          f" | test seed_key={m[9] if m else '-'} phase={m[1] if m else '-'} item_no={m[0] if m else '-'}"
          f" form={m[4] or 'NULL'} crit={m[7]} method={m[8]} section={m[2] or 'NULL'}")
    check(f"kept '{n}': text, seed_key and phase equal live; form/criterion/method/section NULL",
          same and m[4] == "" and m[5] == "" and m[7] == "<NULL>" and m[8] == "<NULL>" and m[2] == "")
gone = [r[6] for r in items if r[6] in REMOVED]
check("6 replaced items absent on a fresh install", not gone, ", ".join(gone) or "none")

print("\n-- seed 03 run a second time")
fp_sql = ("select count(*) || ' items md5 ' || md5(string_agg(concat_ws(',', id, template_id, item_no, item_text, "
          "eol_phase, section_key, section_sort, seed_key, form_code, form_item_ref, acceptance_criterion, "
          "control_method, is_active), '|' order by id)) from checklist_template_items")
before = db(PROD_DB, fp_sql)
db(PROD_DB, file=f"{ROOT}/database/seed/03_checklist_templates.sql")
after = db(PROD_DB, fp_sql)
print(f"  before: {before}\n  after:  {after}")
check("second run adds and changes nothing", before == after)
dup = db(PROD_DB, "select count(*) from (select template_id, seed_key from checklist_template_items "
                  "group by 1, 2 having count(*) > 1) d")
check("no duplicate (template_id, seed_key)", dup == "0", dup)

print("\n-- reset_and_load_vins.sql: progress rows for the new items")
v = db(PROD_DB, "select count(*) from vehicles")
dist = db(PROD_DB, "select string_agg(n || ' rows x ' || c || ' vins', ', ') from (select n, count(*) c from "
                   "(select vin, count(*) n from checklist_item_progress where checklist_type = 'EOL' group by vin) x "
                   "group by n) y")
form_rows = db(PROD_DB, "select count(*) from checklist_item_progress p join checklist_template_items i "
                        "on i.id = p.check_item_id where i.form_code is not null")
print(f"  vehicles={v}; EOL progress per vin: {dist}; progress rows on form items={form_rows}")
check("every VIN has 104 EOL progress rows", dist == f"104 rows x {v} vins")
check("form items materialised for every VIN", form_rows == str(95 * int(v)), form_rows)

db("postgres", f"DROP DATABASE {PROD_DB};")
print(f"  dropped {PROD_DB}")

# ---------------------------------------------------------------- 2. migration 0040
print(f"\n== 2. {DEV_DB}: 0040 on a delivered vehicle")
vin = db(DEV_DB, "select vin from vehicle_eol_workflow where document_approved_at is not null order by vin limit 1")
tid = db(DEV_DB, f"select eol_template_id from vehicles where vin = '{vin}'")
print(f"  vehicle {vin} (branch shipped, depot released, delivered), EOL template {tid}")
fp_dev = ("select count(*) || ' rows md5 ' || md5(string_agg(p::text, '|' order by p.id)) "
          "from checklist_item_progress p where p.vin = '" + vin + "'")
dev_before = db(DEV_DB, fp_dev)
ids = db(DEV_DB, f"""insert into checklist_template_items (template_id, item_no, item_text, eol_phase, is_active)
    values ({tid}, 9001, 'tmp-formseed PENDING', 'DEPOT', false),
           ({tid}, 9002, 'tmp-formseed OK', 'DEPOT', false) returning id""").split()
code, out, err = db(DEV_DB, f"insert into checklist_item_progress (vin, checklist_type, check_item_id, check_status) "
                    f"values ('{vin}', 'EOL', {ids[0]}, 'PENDING') returning id", ok_fail=True)
check("PENDING row on a delivered vehicle is accepted", code == 0, out or err)
code, out, err = db(DEV_DB, f"insert into checklist_item_progress (vin, checklist_type, check_item_id, check_status, "
                    f"check_date) values ('{vin}', 'EOL', {ids[1]}, 'OK', now())", ok_fail=True)
check("answered (OK) row on a delivered vehicle is refused", code != 0, err.splitlines()[0] if err else out)
code, out, err = db(DEV_DB, f"update checklist_item_progress set check_status = 'OK', check_date = now() "
                    f"where vin = '{vin}' and check_item_id = {ids[0]}", ok_fail=True)
check("answering that PENDING row is refused", code != 0, err.splitlines()[0] if err else out)
db(DEV_DB, f"delete from checklist_item_progress where check_item_id in ({ids[0]}, {ids[1]})")
db(DEV_DB, f"delete from checklist_template_items where id in ({ids[0]}, {ids[1]})")
left = db(DEV_DB, "select (select count(*) from checklist_template_items where item_text like 'tmp-formseed%') "
                  "|| ' items, ' || (select count(*) from checklist_item_progress p join checklist_template_items i "
                  "on i.id = p.check_item_id where i.item_text like 'tmp-formseed%') || ' progress'")
dev_after = db(DEV_DB, fp_dev)
print(f"  temp rows left: {left}\n  vehicle progress before: {dev_before}\n  vehicle progress after:  {dev_after}")
check("temp rows deleted, vehicle's own rows unchanged", left == "0 items, 0 progress" and dev_before == dev_after)

print("\nRESULT:", "ALL PASS" if not failures else f"{len(failures)} FAIL: {failures}")
sys.exit(1 if failures else 0)
