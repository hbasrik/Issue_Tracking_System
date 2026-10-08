"""Verification for the catalogue seed, code format and duplicate-name fixes.

Runs against a throwaway *_test database built from every migration plus
seeds 01-06, with the API under test on port 18081. Writes the server's
error strings to server-errors.json for error-messages.check.ts.

Usage:
  python3 run-verification.py > verification-output.txt

Refuses to run against port 8080 or a database whose name does not end in _test.
"""
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:18081/api/v1"
DB = "postgres://karea:karea_secret@localhost:5432/karea_codes_test?sslmode=disable"
PSQL = "/opt/homebrew/opt/libpq/bin/psql"
ROOT = "/Users/Basri/Desktop/kts_kms_project"
SEED = ROOT + "/database/seed/05_defect_catalog.sql"
OLD_SEED_REV = "5c0052b^"  # last commit with the DO UPDATE seed
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "lib"))
from output_dir import output_dir  # noqa: E402

assert ":8080" not in BASE, "never touch the live API"
assert DB.split("?")[0].rsplit("/", 1)[1].endswith("_test"), "database must be *_test"

TOKEN = None
FAILS = []
SERVER_ERRORS = {}


def call(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if TOKEN:
        req.add_header("Authorization", "Bearer " + TOKEN)
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read().decode()
            return r.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw)
        except ValueError:
            return e.code, raw


def sql(q):
    out = subprocess.run([PSQL, DB, "-At", "-F", " | ", "-c", q], capture_output=True, text=True, check=True)
    return out.stdout.strip()


def run_seed(path_or_text, label):
    if path_or_text.startswith("/"):
        args = [PSQL, DB, "-v", "ON_ERROR_STOP=1", "-f", path_or_text]
        out = subprocess.run(args, capture_output=True, text=True, check=True)
    else:
        args = [PSQL, DB, "-v", "ON_ERROR_STOP=1"]
        out = subprocess.run(args, input=path_or_text, capture_output=True, text=True, check=True)
    lines = [l for l in out.stdout.splitlines() if l.startswith("INSERT")]
    print(f"  {label}: {' / '.join(lines)}")
    return lines


def check(name, ok, detail=""):
    print(f"{'PASS' if ok else 'FAIL'} {name}" + (f" — {detail}" if detail != "" else ""))
    if not ok:
        FAILS.append(name)


def expect(name, status, body, want_status, want_error=None):
    err = body.get("error") if isinstance(body, dict) else body
    ok = status == want_status and (want_error is None or err == want_error)
    shown = f"HTTP {status}" + (f" {json.dumps(err, ensure_ascii=False)}" if err else "")
    check(name, ok, shown)
    if err and status >= 400:
        SERVER_ERRORS[name] = {"status": status, "error": err}
    return body


def part_row(code):
    return sql(f"SELECT code, name_tr, name_en, sort_order, (SELECT code FROM defect_zones z WHERE z.id = zone_id), is_active FROM defect_parts WHERE code = '{code}'")


print("== 1. Seed is insert-only ==")
print("Fixture edits a quality engineer could make in the admin page (test DB only):")
EDIT = ("UPDATE defect_parts SET name_tr = 'Kapı (kalite ekibi adı)', sort_order = 42 WHERE code = '10-01';"
        "UPDATE defect_types SET default_process_id = NULL, name_en = 'Paint / surface (QA wording)' WHERE code = '02';")
sql(EDIT)
print("  part 10-01:", part_row("10-01"))
print("  type 02   :", sql("SELECT code, name_tr, name_en, default_process_id FROM defect_types WHERE code = '02'"))

old_seed = subprocess.run(["git", "-C", ROOT, "show", f"{OLD_SEED_REV}:database/seed/05_defect_catalog.sql"],
                          capture_output=True, text=True, check=True).stdout
print(f"Before the fix — seed from {OLD_SEED_REV} (ON CONFLICT DO UPDATE) re-run:")
run_seed(old_seed, "old seed")
print("  part 10-01:", part_row("10-01"))
print("  type 02   :", sql("SELECT code, name_tr, name_en, default_process_id FROM defect_types WHERE code = '02'"))
check("old seed reverted the rename (bug reproduced)", part_row("10-01").split(" | ")[1] == "Kapı")

sql(EDIT)
sql("DELETE FROM defect_parts WHERE code = '40-04'")
print("Edits re-applied; part 40-04 deleted to show missing rows still get added.")
print("After the fix — current seed (ON CONFLICT DO NOTHING) re-run:")
run_seed(SEED, "new seed")
row = part_row("10-01").split(" | ")
check("rename kept", row[1] == "Kapı (kalite ekibi adı)", row[1])
check("sort order kept", row[3] == "42", row[3])
t02 = sql("SELECT name_en, coalesce(default_process_id::text, 'NULL') FROM defect_types WHERE code = '02'").split(" | ")
check("type EN name kept", t02[0] == "Paint / surface (QA wording)", t02[0])
check("type default process kept (NULL, seed says PAINT)", t02[1] == "NULL", t02[1])
check("missing part 40-04 re-added", part_row("40-04") != "", part_row("40-04"))
again = run_seed(SEED, "second re-run")
check("second re-run inserts nothing", len(again) == 4 and all(l == "INSERT 0 0" for l in again))

print()
print("== 2. Code format ==")
s, b = call("POST", "/auth/login", {"email": "manager@karea.local", "password": "changeme123"})
TOKEN = b["access_token"] if isinstance(b, dict) and "access_token" in b else (b or {}).get("token")
check("login (seed user, test DB)", s == 200 and TOKEN is not None, f"HTTP {s}")
zones = {z["Code"]: z["ID"] for z in call("GET", "/defect-zones")[1]["items"]}
BODY, TRIM = zones["10"], zones["30"]
body_codes = sorted(p["Code"] for p in call("GET", "/defect-parts")[1]["items"] if p["ZoneID"] == BODY)
print("  Body part codes:", ", ".join(body_codes))

def new_part(zone, code, name_tr, name_en=None):
    return call("POST", "/defect-parts", {"zone_id": zone, "code": code, "name_tr": name_tr,
                                          "name_en": name_en or name_tr, "sort_order": 1, "is_active": True})

expect("part 40-77 in Body rejected", *new_part(BODY, "40-77", "Test Kapı Kolu"), 400,
       "part code must be the zone code, a dash and two digits: expected 10-NN")
expect("part ZZZ in Body rejected", *new_part(BODY, "ZZZ", "Test Kapı Kolu"), 400,
       "part code must be the zone code, a dash and two digits: expected 10-NN")
expect("part 10-7 rejected", *new_part(BODY, "10-7", "Test Kapı Kolu"), 400)
expect("part 10-00 rejected", *new_part(BODY, "10-00", "Test Kapı Kolu"), 400)
expect("part 30-08 in Body rejected", *new_part(BODY, "30-08", "Test Kapı Kolu"), 400,
       "part code must be the zone code, a dash and two digits: expected 10-NN")
s, created = new_part(BODY, "10-10", "Test Kapı Kolu", "Test door handle")
expect("part 10-10 (suggested next code) accepted", s, created, 201)
TEST_PART = created["ID"]

def new_type(code, name_tr, name_en=None):
    return call("POST", "/defect-types", {"code": code, "name_tr": name_tr, "name_en": name_en or name_tr,
                                          "sort_order": 1, "is_active": True, "default_process_id": None})

expect("type code 7 rejected", *new_type("7", "Test tipi"), 400, "defect type code must be two digits")
expect("type code AB rejected", *new_type("AB", "Test tipi"), 400, "defect type code must be two digits")
expect("type code 10-01 rejected", *new_type("10-01", "Test tipi"), 400, "defect type code must be two digits")
s, t = new_type("10", "Test tipi", "Test type")
expect("type code 10 (suggested next code) accepted", s, t, 201)
TEST_TYPE = t["ID"]

s, b = call("POST", "/defect-catalog/promote-other",
            {"kind": "part", "custom_name": "serbest", "code": "40-77", "name_tr": "Ayna kapağı",
             "name_en": "Mirror cap", "zone_id": BODY, "rebind_issues": False})
expect("promote-other part with wrong prefix rejected", s, b, 400,
       "part code must be the zone code, a dash and two digits: expected 10-NN")

print()
print("== 3. Duplicate names ==")
expect("' test kapı kolu ' in Body rejected", *new_part(BODY, "10-11", " test kapı kolu "), 409,
       "a part with this name already exists in the zone")
expect("'TEST KAPI KOLU' in Body rejected", *new_part(BODY, "10-11", "TEST KAPI KOLU", "Other EN"), 409,
       "a part with this name already exists in the zone")
expect("same EN name in Body rejected", *new_part(BODY, "10-11", "Başka ad", "test DOOR handle"), 409)
s, b = new_part(TRIM, "30-08", "Test Kapı Kolu", "Test door handle")
expect("same name in Trim accepted", s, b, 201)
expect("type ' çizik / darbe / HASAR ' rejected", *new_type("11", " çizik / darbe / HASAR ", "x"), 409,
       "a defect type with this name already exists")
s, b = call("PATCH", f"/defect-parts/{TEST_PART}",
            {"zone_id": BODY, "code": "10-10", "name_tr": "Tampon", "name_en": "Test door handle", "sort_order": 1, "is_active": True})
expect("renaming onto sibling 'Tampon' rejected", s, b, 409)
s, b = call("PATCH", f"/defect-parts/{TEST_PART}",
            {"zone_id": BODY, "code": "10-10", "name_tr": "TEST KAPI KOLU", "name_en": "Test door handle", "sort_order": 1, "is_active": True})
expect("re-casing the part's own name accepted", s, b, 200)

print()
print("== 4. Legacy rows stay editable (unchanged code/name are not re-checked) ==")
legacy = sql(f"INSERT INTO defect_parts (zone_id, code, name_tr, name_en, sort_order, is_active) "
             f"VALUES ({BODY}, 'ZZZ', 'Eski kayıt', 'Legacy row', 99, TRUE) RETURNING id").splitlines()[0]
print("  legacy fixture inserted directly (test DB):", part_row("ZZZ"))
s, b = call("PATCH", f"/defect-parts/{legacy}",
            {"zone_id": BODY, "code": "ZZZ", "name_tr": "Eski kayıt (yeni ad)", "name_en": "Legacy row", "sort_order": 99, "is_active": False})
expect("legacy ZZZ part renamed and deactivated", s, b, 200)
s, b = call("PATCH", f"/defect-parts/{legacy}",
            {"zone_id": BODY, "code": "ZZY", "name_tr": "Eski kayıt (yeni ad)", "name_en": "Legacy row", "sort_order": 99, "is_active": False})
expect("changing the legacy code to another bad code rejected", s, b, 400)

with open(os.path.join(output_dir(HERE), "server-errors.json"), "w") as f:
    json.dump(SERVER_ERRORS, f, ensure_ascii=False, indent=1)

print()
if FAILS:
    print(f"FAILED: {len(FAILS)} -> {FAILS}")
    sys.exit(1)
print("ALL CHECKS PASSED")
