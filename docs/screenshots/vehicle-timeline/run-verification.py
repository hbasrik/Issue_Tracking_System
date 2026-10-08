#!/usr/bin/env python3
"""Vehicle timeline verification (docs/16 A40). Test databases only.

  python3 run-verification.py db    build karea_timeline_test (every migration +
                                    seeds 01-06) and check migration 0037 on
                                    karea_timeline_mig_test (0001-0036 + seeds,
                                    then 0037 up twice / down / up)
  python3 run-verification.py api   drive one vehicle through hold, issue,
                                    checklists, branch ship and the development
                                    reset on the test API (port 18081) and show
                                    the audit rows + timeline response

The live database and the API on 8080 are never used.
"""
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

ROOT = "/Users/Basri/Desktop/kts_kms_project"
PSQL = "/opt/homebrew/opt/libpq/bin/psql"
URL = "postgres://karea:karea_secret@localhost:5432/{db}?sslmode=disable"
MIGRATIONS = ROOT + "/database/migrations"
SEEDS = ROOT + "/database/seed"
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "lib"))
from output_dir import output_dir  # noqa: E402
OUT = output_dir(ROOT + "/docs/screenshots/vehicle-timeline")
TEST_DB = "karea_timeline_test"
MIG_DB = "karea_timeline_mig_test"
API = "http://localhost:18081/api/v1"
VIN = "N7V1K1SA6TK000006"

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


def migrations(upto):
    import glob
    import os
    files = sorted(glob.glob(MIGRATIONS + "/*.up.sql"))
    return [f for f in files if int(os.path.basename(f)[:4]) <= upto]


def fresh(db, upto, seeds=True):
    psql("postgres", f"DROP DATABASE IF EXISTS {db};")
    psql("postgres", f"CREATE DATABASE {db};")
    for f in migrations(upto):
        psql(db, file=f)
    if seeds:
        for name in ["01_stations.sql", "02_stations_and_steps.sql", "03_checklist_templates.sql",
                     "04_users.sql", "05_defect_catalog.sql", "06_test_vehicles.sql"]:
            psql(db, file=f"{SEEDS}/{name}")


FN_DEF = "SELECT md5(pg_get_functiondef('fn_enforce_branch_shipment'::regproc))"
AUDIT_MD5 = "SELECT count(*) || ' rows, md5 ' || md5(COALESCE(string_agg(a::text, ',' ORDER BY id), '')) FROM audit_logs a"


def phase_db():
    print("== 1. Migration 0037 on karea_timeline_mig_test (0001-0036 + seeds 01-06) ==")
    fresh(MIG_DB, 36)
    before_fn = psql(MIG_DB, FN_DEF)
    before_audit = psql(MIG_DB, AUDIT_MD5)
    print(f"  before 0037: function md5 {before_fn}; audit_logs {before_audit}")
    up = f"{MIGRATIONS}/0037_branch_ship_status_audit.up.sql"
    down = f"{MIGRATIONS}/0037_branch_ship_status_audit.down.sql"
    psql(MIG_DB, file=up)
    after_fn = psql(MIG_DB, FN_DEF)
    body = psql(MIG_DB, "SELECT pg_get_functiondef('fn_enforce_branch_shipment'::regproc)")
    check("0037 up replaces the function", after_fn != before_fn, after_fn)
    check("new body writes STATUS_CHANGE with trigger eol_branch_ship",
          "'STATUS_CHANGE'" in body and "'eol_branch_ship'" in body)
    check("existing audit rows unchanged by 0037 up", psql(MIG_DB, AUDIT_MD5) == before_audit, psql(MIG_DB, AUDIT_MD5))
    psql(MIG_DB, file=up)
    check("0037 up twice: same function", psql(MIG_DB, FN_DEF) == after_fn)
    psql(MIG_DB, file=down)
    check("0037 down restores the 0036 function exactly", psql(MIG_DB, FN_DEF) == before_fn, psql(MIG_DB, FN_DEF))
    psql(MIG_DB, file=down)
    check("0037 down twice: same function", psql(MIG_DB, FN_DEF) == before_fn)
    psql(MIG_DB, file=up)
    check("0037 up after down: new function again", psql(MIG_DB, FN_DEF) == after_fn)
    check("audit rows unchanged after up/down/up", psql(MIG_DB, AUDIT_MD5) == before_audit)
    psql("postgres", f"DROP DATABASE {MIG_DB};")
    print(f"  dropped {MIG_DB}")

    print(f"\n== 2. {TEST_DB}: every migration + seeds 01-06 ==")
    fresh(TEST_DB, 9999)
    print(f"  applied {len(migrations(9999))} migrations; schema_migrations not used (psql apply)")
    print("  vehicle " + VIN + ": " + psql(TEST_DB,
          f"SELECT v.current_global_status || ' / ' || w.current_stage FROM vehicles v JOIN vehicle_eol_workflow w USING (vin) WHERE vin = '{VIN}'"))


TOKEN = None


def call(method, path, body=None, ok=(200, 201)):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(API + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if TOKEN:
        req.add_header("Authorization", "Bearer " + TOKEN)
    try:
        with urllib.request.urlopen(req) as r:
            code, raw = r.status, r.read()
    except urllib.error.HTTPError as e:
        code, raw = e.code, e.read()
    out = json.loads(raw) if raw else None
    if code not in ok:
        raise SystemExit(f"{method} {path} -> {code} {raw[:300]!r}")
    return out


AUDIT_ROWS = (
    "SELECT a.id, to_char(a.event_at AT TIME ZONE 'UTC', 'HH24:MI:SS.MS'), a.event_type, "
    "COALESCE(a.old_value,''), COALESCE(a.new_value,''), COALESCE(u.full_name,''), a.metadata "
    "FROM audit_logs a LEFT JOIN users u ON u.id = a.performed_by "
    "WHERE a.vin = '{vin}' AND a.event_type IN ('STATUS_CHANGE','EOL_WORKFLOW_STAGE_CHANGE') "
    "AND a.id > {after} ORDER BY a.id"
)


def show_status_rows(after):
    rows = psql(TEST_DB, AUDIT_ROWS.format(vin=VIN, after=after))
    for line in rows.splitlines():
        print("    " + line)
    return rows


def phase_api():
    global TOKEN
    print(f"== 3. Scenario on {VIN} via the test API (18081 -> {TEST_DB}) ==")
    TOKEN = call("POST", "/auth/login", {"email": "manager@karea.local", "password": "changeme123"})["token"]
    start_id = int(psql(TEST_DB, "SELECT COALESCE(max(id), 0) FROM audit_logs"))

    vehicle = call("GET", f"/vehicles/{VIN}")
    print(f"  start: {vehicle['CurrentGlobalStatus']} / {vehicle.get('CurrentEOLStage')}")

    # Hold and release (application path, already wrote STATUS_CHANGE before this work).
    call("POST", f"/vehicles/{VIN}/hold", {"reason": "Ayna parçası bekleniyor"})
    call("POST", f"/vehicles/{VIN}/unhold")

    # One manual issue: create, progress, classification correction, done, approve, undo, approve.
    combo = psql(TEST_DB, (
        "SELECT p.id || '|' || t.id || '|' || it.id || '|' || s.id "
        "FROM defect_parts p JOIN defect_types t ON t.is_active AND t.code NOT LIKE '99%' "
        "CROSS JOIN LATERAL (SELECT id FROM issue_types ORDER BY id LIMIT 1) it "
        f"CROSS JOIN LATERAL (SELECT id FROM stations ORDER BY id LIMIT 1) s "
        "WHERE p.is_active AND p.code NOT LIKE '99%' ORDER BY p.id, t.id LIMIT 1"))
    part_id, type_id, issue_type_id, station_id = map(int, combo.split("|"))
    other_part = int(psql(TEST_DB, f"SELECT id FROM defect_parts WHERE is_active AND id <> {part_id} AND code NOT LIKE '99%' ORDER BY id LIMIT 1"))
    issue = call("POST", "/issues", {
        "vin": VIN, "source_type": "MANUAL", "issue_type_id": issue_type_id, "station_id": station_id,
        "severity": "MEDIUM", "description": "Zaman çizelgesi doğrulaması (test veritabanı)",
        "defect_part_id": part_id, "defect_type_id": type_id,
    })
    issue_id = issue.get("ID") or issue.get("id")
    call("PATCH", f"/issues/{issue_id}/status", {"status": "IN_PROGRESS"})
    call("PATCH", f"/issues/{issue_id}/classification", {"defect_part_id": other_part, "defect_type_id": type_id})
    call("PATCH", f"/issues/{issue_id}/status", {"status": "DONE", "solution_description": "Ayna değiştirildi"})
    call("PATCH", f"/issues/{issue_id}/status", {"status": "APPROVED"})
    call("POST", f"/issues/{issue_id}/undo-approval")
    call("PATCH", f"/issues/{issue_id}/status", {"status": "APPROVED"})
    print(f"  issue #{issue_id}: OPEN → IN_PROGRESS → classification → DONE → APPROVED → undo → APPROVED")

    # Station steps and the branch-stage checklists (TEST, SHIPMENT, EOL BRANCH).
    steps = call("GET", f"/vehicles/{VIN}/station-steps")["Items"]
    for s in steps:
        if s["Status"] != "OK":
            call("POST", f"/vehicles/{VIN}/station-steps/{s['ID']}", {"status": "OK"})
    ticked = {}
    for kind in ("test", "shipment", "eol"):
        items = call("GET", f"/vehicles/{VIN}/checklist/{kind}")["items"]
        n = 0
        for it in items:
            if not it.get("IsActive", True) or it["Status"] in ("OK", "CONDITIONAL_OK"):
                continue
            if kind == "eol" and it.get("EolPhase") != "BRANCH":
                continue
            body = {"status": "OK"}
            if kind == "shipment" and it["ItemNo"] == 5:
                body = {"status": "CONDITIONAL_OK", "conditional_desc": "Paspas sonra takılacak"}
            if kind == "test" and it["ItemNo"] == 3:
                call("POST", f"/vehicles/{VIN}/checklist/{kind}/{it['ItemID']}",
                     {"status": "NOT_OK", "rejected_desc": "Tekrar kontrol"})
            call("POST", f"/vehicles/{VIN}/checklist/{kind}/{it['ItemID']}", body)
            n += 1
        ticked[kind] = n
    print(f"  station steps OK: {len(steps)}; checklist items marked: {ticked}")

    print("\n== 4. Branch shipment (trigger fn_enforce_branch_shipment, migration 0037) ==")
    before_ship = int(psql(TEST_DB, "SELECT COALESCE(max(id), 0) FROM audit_logs"))
    call("POST", f"/vehicles/{VIN}/eol/branch-ship")
    rows = show_status_rows(before_ship)
    check("branch ship wrote EOL_WORKFLOW_STAGE_CHANGE BRANCH → DEPOT",
          "|EOL_WORKFLOW_STAGE_CHANGE|BRANCH|DEPOT|Local Manager|" in rows)
    check("branch ship wrote STATUS_CHANGE IN_PRODUCTION → IN_WAREHOUSE by the shipper",
          "|STATUS_CHANGE|IN_PRODUCTION|IN_WAREHOUSE|Local Manager|{\"trigger\": \"eol_branch_ship\"}" in rows)
    check("vehicle is IN_WAREHOUSE / DEPOT", psql(TEST_DB,
          f"SELECT v.current_global_status || '/' || w.current_stage FROM vehicles v JOIN vehicle_eol_workflow w USING (vin) WHERE vin = '{VIN}'") == "IN_WAREHOUSE/DEPOT")

    print("\n== 5. Development reset (APP_ENV=development on the test API) ==")
    before_reset = int(psql(TEST_DB, "SELECT COALESCE(max(id), 0) FROM audit_logs"))
    call("POST", f"/vehicles/{VIN}/eol/reset")
    rows = show_status_rows(before_reset)
    check("reset wrote EOL_WORKFLOW_STAGE_CHANGE DEPOT → BRANCH with dev_reset",
          "|EOL_WORKFLOW_STAGE_CHANGE|DEPOT|BRANCH|Local Manager|" in rows and '"dev_reset": true' in rows)
    check("reset wrote STATUS_CHANGE IN_WAREHOUSE → IN_PRODUCTION with dev_reset",
          "|STATUS_CHANGE|IN_WAREHOUSE|IN_PRODUCTION|Local Manager|{\"action\": \"dev_reset\", \"dev_reset\": true}" in rows)
    check("vehicle is IN_PRODUCTION / BRANCH", psql(TEST_DB,
          f"SELECT v.current_global_status || '/' || w.current_stage FROM vehicles v JOIN vehicle_eol_workflow w USING (vin) WHERE vin = '{VIN}'") == "IN_PRODUCTION/BRANCH")

    print("\n== 6. Every status / stage audit row written during the scenario ==")
    show_status_rows(start_id)
    counts = psql(TEST_DB, (
        f"SELECT event_type || ' ' || count(*) FROM audit_logs WHERE vin = '{VIN}' AND id > {start_id} "
        "GROUP BY event_type ORDER BY event_type"))
    print("  scenario rows by type: " + ", ".join(counts.splitlines()))

    print("\n== 7. GET /vehicles/{vin}/timeline ==")
    timeline = call("GET", f"/vehicles/{VIN}/timeline")
    items = timeline["items"]
    db_count = int(psql(TEST_DB, (
        f"SELECT count(*) FROM audit_logs WHERE vin = '{VIN}' AND event_type IN "
        "('STATUS_CHANGE','EOL_WORKFLOW_STAGE_CHANGE','CHECKLIST_ITEM_UPDATE','ISSUE_STATUS_CHANGE','ISSUE_CLASSIFICATION_CHANGE')")))
    types = sorted({i["EventType"] for i in items})
    print(f"  items {len(items)}, truncated {timeline['truncated']}, types {types}")
    check("timeline returns every timeline audit row of the vehicle", len(items) == db_count, f"db {db_count}")
    check("timeline covers all five event kinds", len(types) == 5)
    ids = [i["ID"] for i in items]
    check("newest first", ids == sorted(ids, reverse=True))
    check("checklist rows carry item no + text",
          all(i["ItemNo"] and i["ItemText"] for i in items if i["EventType"] == "CHECKLIST_ITEM_UPDATE"))
    check("issue rows carry the issue id",
          all(i["IssueID"] == issue_id for i in items if i["EventType"].startswith("ISSUE_")))
    check("classification row resolved to names",
          any(i["Classification"] for i in items if i["EventType"] == "ISSUE_CLASSIFICATION_CHANGE"))
    check("hold row carries the reason",
          any(i["Action"] == "place_on_hold" and i["HoldReason"] for i in items))
    check("dev reset rows flagged", sum(1 for i in items if i["DevReset"]) == 2)
    with open(f"{OUT}/api-timeline.json", "w") as f:
        json.dump(timeline, f, ensure_ascii=False, indent=1)
    print("  saved api-timeline.json")


if __name__ == "__main__":
    {"db": phase_db, "api": phase_api}[sys.argv[1]]()
    print(f"\n{'ALL CHECKS PASSED' if not failures else 'FAILED: ' + '; '.join(failures)}")
    sys.exit(1 if failures else 0)
