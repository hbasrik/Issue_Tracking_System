#!/usr/bin/env python3
"""EoL single-note verification (docs/16 A42). Test database only.

  python3 run-verification.py db    build karea_eolnote_test (every migration +
                                    seeds 01-06)
  python3 run-verification.py api   exercise the note on the test API
                                    (port 18081 -> karea_eolnote_test)
  python3 run-verification.py drop  drop karea_eolnote_test

The live database and the API on 8080 are never used.
"""
import glob
import json
import subprocess
import sys
import urllib.error
import urllib.request

ROOT = "/Users/Basri/Desktop/kts_kms_project"
PSQL = "/opt/homebrew/opt/libpq/bin/psql"
URL = "postgres://karea:karea_secret@localhost:5432/{db}?sslmode=disable"
SEEDS = ROOT + "/database/seed"
TEST_DB = "karea_eolnote_test"
API = "http://localhost:18081/api/v1"

failures = []


def psql(db, sql=None, file=None):
    cmd = [PSQL, URL.format(db=db), "-X", "-q", "-v", "ON_ERROR_STOP=1", "-At", "-F", "|"]
    cmd += ["-f", file] if file else ["-c", sql]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit(f"psql failed on {db}: {r.stderr.strip()}")
    return r.stdout.strip()


def check(label, ok, detail=""):
    print(f"  [{'PASS' if ok else 'FAIL'}] {label}" + (f" — {detail}" if detail else ""))
    if not ok:
        failures.append(label)


def phase_db():
    psql("postgres", f"DROP DATABASE IF EXISTS {TEST_DB};")
    psql("postgres", f"CREATE DATABASE {TEST_DB};")
    files = sorted(glob.glob(ROOT + "/database/migrations/*.up.sql"))
    for f in files:
        psql(TEST_DB, file=f)
    for name in ["01_stations.sql", "02_stations_and_steps.sql", "03_checklist_templates.sql",
                 "04_users.sql", "05_defect_catalog.sql", "06_test_vehicles.sql"]:
        psql(TEST_DB, file=f"{SEEDS}/{name}")
    print(f"built {TEST_DB}: {len(files)} migrations + seeds 01-06")


def call(method, path, token=None, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(API + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read()
            return r.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw)
        except ValueError:
            return e.code, raw.decode()


ROW = ("SELECT check_status, COALESCE(approved_desc,'<NULL>'), COALESCE(conditional_desc,'<NULL>'), "
       "COALESCE(rejected_desc,'<NULL>'), COALESCE(rework_desc,'<NULL>') FROM checklist_item_progress "
       "WHERE vin = '{vin}' AND check_item_id = {item} AND checklist_type = 'EOL'")


def phase_api():
    st, login = call("POST", "/auth/login", body={"email": "manager@karea.local", "password": "changeme123"})
    if st != 200:
        raise SystemExit(f"login failed: {st} {login}")
    tok = login["access_token"] if "access_token" in login else login["token"]

    vin, item = psql(TEST_DB, (
        "SELECT p.vin, p.check_item_id FROM checklist_item_progress p "
        "JOIN checklist_template_items cti ON cti.id = p.check_item_id "
        "JOIN vehicle_eol_workflow w ON w.vin = p.vin "
        "WHERE p.checklist_type = 'EOL' AND p.check_status = 'PENDING' "
        "AND cti.eol_phase = 'BRANCH' AND w.current_stage = 'BRANCH' "
        "ORDER BY p.vin, cti.item_no LIMIT 1")).split("|")
    item = int(item)
    print(f"fixture: vin={vin} item={item} (seeded test vehicle, test DB)")
    path = f"/vehicles/{vin}/checklist/eol/{item}"

    def view():
        _, res = call("GET", f"/vehicles/{vin}/checklist/eol", tok)
        return next(i for i in res["items"] if i["ItemID"] == item)

    def row():
        return psql(TEST_DB, ROW.format(vin=vin, item=item))

    print("\n== 1. OK with note -> approved_desc ==")
    st, _ = call("POST", path, tok, {"status": "OK", "note": "Akü 12.6 V"})
    check("POST OK + note accepted", st == 200, f"HTTP {st}")
    r = row()
    print("   db:", r)
    check("note stored in approved_desc only", r == "OK|Akü 12.6 V|<NULL>|<NULL>|<NULL>")
    v = view()
    print("   api Note:", repr(v.get("Note")), "ApprovedDesc:", repr(v.get("ApprovedDesc")))
    check("GET returns Note for OK", v.get("Note") == "Akü 12.6 V")

    print("\n== 2. CONDITIONAL_OK with note -> conditional_desc; OK note cleared ==")
    st, _ = call("POST", path, tok, {"status": "CONDITIONAL_OK", "note": "Paspas sonra"})
    check("POST CONDITIONAL_OK + note accepted", st == 200, f"HTTP {st}")
    r = row()
    print("   db:", r)
    check("note moved to conditional_desc", r == "CONDITIONAL_OK|<NULL>|Paspas sonra|<NULL>|<NULL>")
    check("GET Note follows answer", view().get("Note") == "Paspas sonra")

    print("\n== 3. Legacy field still accepted (old mobile) ==")
    st, _ = call("POST", path, tok, {"status": "NOT_OK", "rejected_desc": "Conta yırtık"})
    check("POST NOT_OK + rejected_desc accepted", st == 200, f"HTTP {st}")
    r = row()
    print("   db:", r)
    check("legacy rejected_desc stored", r == "NOT_OK|<NULL>|<NULL>|Conta yırtık|<NULL>")
    check("GET Note reads rejected_desc", view().get("Note") == "Conta yırtık")

    print("\n== 4. Failure answers still require a note ==")
    st, body = call("POST", path, tok, {"status": "REWORK", "note": "   "})
    check("REWORK with blank note -> 400", st == 400, f"HTTP {st} {body}")
    st, body = call("POST", path, tok, {"status": "REWORK"})
    check("REWORK with no note -> 400", st == 400, f"HTTP {st} {body}")
    check("row unchanged after refusals", row() == "NOT_OK|<NULL>|<NULL>|Conta yırtık|<NULL>")

    print("\n== 5. OK without note clears the old note ==")
    st, _ = call("POST", path, tok, {"status": "OK"})
    r = row()
    print("   db:", r)
    check("OK without note: all four columns NULL", r == "OK|<NULL>|<NULL>|<NULL>|<NULL>")

    print("\n== 6. Constraint unchanged ==")
    cdef = psql(TEST_DB, "SELECT pg_get_constraintdef(oid) FROM pg_constraint "
                         "WHERE conname = 'chk_description_required_by_status'")
    print("  ", cdef)
    check("chk_description_required_by_status present and does not mention approved_desc",
          bool(cdef) and "approved_desc" not in cdef)

    print("\n== 7. Audit rows for this item (status only, no text) ==")
    print(psql(TEST_DB, f"SELECT id, old_value, new_value, metadata FROM audit_logs "
                        f"WHERE vin = '{vin}' AND event_type = 'CHECKLIST_ITEM_UPDATE' "
                        f"AND (metadata->>'item_id')::int = {item} ORDER BY id"))

    print("\nALL CHECKS PASSED" if not failures else f"\nFAILED: {failures}")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    {"db": phase_db, "api": phase_api,
     "drop": lambda: print(psql("postgres", f"DROP DATABASE IF EXISTS {TEST_DB};") or f"dropped {TEST_DB}")
     }[sys.argv[1]]()
