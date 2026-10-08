#!/usr/bin/env python3
"""Management audit verification (docs/16 A41). Test databases only.

  python3 run-verification.py db    check migration 0038 on karea_admin_mig_test
                                    (0001-0037 + seeds, then 0038 up twice /
                                    down twice / up, refused down with rows) and
                                    build karea_admin_test (every migration +
                                    seeds 01-06)
  python3 run-verification.py api   run every management action on the test
                                    API (port 18081 -> karea_admin_test) and show
                                    the audit rows, the password/hash scan and
                                    the activity endpoint visibility
  python3 run-verification.py drop  drop karea_admin_test

The live database and the API on 8080 are never used.
"""
import glob
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
OUT = output_dir(ROOT + "/docs/screenshots/admin-audit")
TEST_DB = "karea_admin_test"
MIG_DB = "karea_admin_mig_test"
API = "http://localhost:18081/api/v1"
ADMIN_TYPES = ("USER_ADMIN_CHANGE", "ROLE_PERMISSION_CHANGE", "CHECKLIST_TEMPLATE_CHANGE", "DEFECT_CATALOG_CHANGE")

failures = []


def psql(db, sql=None, file=None, ok_fail=False):
    cmd = [PSQL, URL.format(db=db), "-X", "-q", "-v", "ON_ERROR_STOP=1", "-At", "-F", "|"]
    cmd += ["-f", file] if file else ["-c", sql]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        if ok_fail:
            return None, r.stderr.strip()
        raise SystemExit(f"psql failed on {db}: {r.stderr.strip()}")
    return (r.stdout.strip(), "") if ok_fail else r.stdout.strip()


def check(label, ok, detail=""):
    print(f"  [{'PASS' if ok else 'FAIL'}] {label}" + (f" — {detail}" if detail else ""))
    if not ok:
        failures.append(label)


def migrations(upto):
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


ENUM = ("SELECT string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) FROM pg_enum e "
        "JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'audit_event_enum'")
AUDIT_MD5 = ("SELECT count(*) || ' rows, md5 ' || md5(COALESCE(string_agg(a::text, ',' ORDER BY id), '')) "
             "FROM audit_logs a")


def phase_db():
    print("== 1. Migration 0038 on karea_admin_mig_test (0001-0037 + seeds 01-06) ==")
    fresh(MIG_DB, 37)
    up = f"{MIGRATIONS}/0038_admin_audit_events.up.sql"
    down = f"{MIGRATIONS}/0038_admin_audit_events.down.sql"
    before_enum = psql(MIG_DB, ENUM)
    before_audit = psql(MIG_DB, AUDIT_MD5)
    print(f"  before: enum {before_enum}")
    print(f"  before: audit_logs {before_audit}")
    psql(MIG_DB, file=up)
    after_enum = psql(MIG_DB, ENUM)
    print(f"  after up: enum {after_enum}")
    check("0038 up adds the four management values",
          after_enum == before_enum + "," + ",".join(ADMIN_TYPES))
    psql(MIG_DB, file=up)
    check("0038 up twice: enum unchanged", psql(MIG_DB, ENUM) == after_enum)
    check("existing audit rows unchanged by up", psql(MIG_DB, AUDIT_MD5) == before_audit)

    psql(MIG_DB, "INSERT INTO audit_logs (event_type, metadata) VALUES "
                 "('USER_ADMIN_CHANGE', '{\"tmp_0038_down_probe\": true}')")
    out, err = psql(MIG_DB, file=down, ok_fail=True)
    check("0038 down refuses while management rows exist", out is None and "refused" in err,
          err.splitlines()[0] if err else "")
    check("refused down left enum and rows intact",
          psql(MIG_DB, ENUM) == after_enum
          and psql(MIG_DB, "SELECT count(*) FROM audit_logs WHERE metadata ? 'tmp_0038_down_probe'") == "1")
    psql(MIG_DB, "DELETE FROM audit_logs WHERE metadata ? 'tmp_0038_down_probe'")

    psql(MIG_DB, file=down)
    check("0038 down restores the 0037 enum", psql(MIG_DB, ENUM) == before_enum, psql(MIG_DB, ENUM))
    psql(MIG_DB, file=down)
    check("0038 down twice: no-op", psql(MIG_DB, ENUM) == before_enum)
    check("audit rows unchanged by down", psql(MIG_DB, AUDIT_MD5) == before_audit)
    psql(MIG_DB, file=up)
    check("0038 up after down: values back", psql(MIG_DB, ENUM) == after_enum)
    check("event_type column uses the rebuilt type, no leftover type",
          psql(MIG_DB, "SELECT format_type(atttypid, atttypmod) FROM pg_attribute "
                       "WHERE attrelid = 'audit_logs'::regclass AND attname = 'event_type'") == "audit_event_enum"
          and psql(MIG_DB, "SELECT count(*) FROM pg_type WHERE typname = 'audit_event_enum_0038'") == "0")
    psql("postgres", f"DROP DATABASE {MIG_DB};")
    print(f"  dropped {MIG_DB}")

    print(f"\n== 2. {TEST_DB}: every migration + seeds 01-06 ==")
    fresh(TEST_DB, 9999)
    print(f"  applied {len(migrations(9999))} migrations; enum {psql(TEST_DB, ENUM)}")


def http(method, path, token=None, body=None, raw=False):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(API + path, data=data, method=method)
    req.add_header("content-type", "application/json")
    if token:
        req.add_header("authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req) as r:
            text = r.read().decode()
            return r.status, (json.loads(text) if text and not raw else text)
    except urllib.error.HTTPError as e:
        text = e.read().decode()
        try:
            return e.code, json.loads(text)
        except ValueError:
            return e.code, text


def login(email, password):
    status, body = http("POST", "/auth/login", body={"email": email, "password": password})
    if status != 200:
        raise SystemExit(f"login {email} failed: {status} {body}")
    return body["token"]


AUDIT_ROW = ("SELECT a.id, a.event_type, u.full_name, COALESCE(a.vin, '<NULL>'), "
             "COALESCE(a.old_value, '<NULL>'), COALESCE(a.new_value, '<NULL>'), a.metadata::text "
             "FROM audit_logs a LEFT JOIN users u ON u.id = a.performed_by "
             "WHERE a.event_type::text IN ('USER_ADMIN_CHANGE','ROLE_PERMISSION_CHANGE',"
             "'CHECKLIST_TEMPLATE_CHANGE','DEFECT_CATALOG_CHANGE') AND a.id > {after} ORDER BY a.id")


def last_admin_id():
    return int(psql(TEST_DB, "SELECT COALESCE(max(id), 0) FROM audit_logs"))


evidence = []


def step(label, fn, expect_rows, expect_action=None, expect_type=None):
    """Run one API action and show the management audit rows it wrote."""
    before = last_admin_id()
    status, body = fn()
    rows = [r.split("|", 6) for r in psql(TEST_DB, AUDIT_ROW.format(after=before)).splitlines() if r]
    print(f"\n-- {label}: HTTP {status}")
    for r in rows:
        meta = json.loads(r[6])
        print(f"   audit #{r[0]} {r[1]} by {r[2]} vin={r[3]} old={r[4]} new={r[5]}")
        print(f"     metadata {json.dumps(meta, ensure_ascii=False)}")
        evidence.append({"step": label, "id": int(r[0]), "event_type": r[1], "actor": r[2],
                         "vin": r[3], "old_value": r[4], "new_value": r[5], "metadata": meta})
    ok = status < 300 and len(rows) == expect_rows
    if ok and rows and expect_action:
        meta = json.loads(rows[-1][6])
        ok = meta.get("action") == expect_action and (expect_type is None or rows[-1][1] == expect_type)
        ok = ok and rows[-1][2] == "Local Manager" and rows[-1][3] == "<NULL>"
    check(f"{label}: {expect_rows} row(s)" + (f", action {expect_action}" if expect_action else ""), ok,
          "" if ok else f"status {status} rows {len(rows)} body {str(body)[:200]}")
    return body


def phase_api():
    tok = login("manager@karea.local", "changeme123")
    secrets = []

    print("== 1. Users (USER_ADMIN_CHANGE) ==")
    created = step("user create", lambda: http("POST", "/users", tok, {
        "full_name": "Tmp Denetim Kullanıcı", "email": "tmp.audit.user@karea.local", "role": "OPERATOR"}),
        1, "create", "USER_ADMIN_CHANGE")
    uid = created["user"]["ID"]
    secrets.append(created["temporary_password"])
    step("user role change OPERATOR -> QUALITY",
         lambda: http("PATCH", f"/users/{uid}", tok, {"role": "QUALITY"}), 1, "role_change")
    step("user no-op update (same role)", lambda: http("PATCH", f"/users/{uid}", tok, {"role": "QUALITY"}), 0)
    step("user deactivate", lambda: http("PATCH", f"/users/{uid}", tok, {"is_active": False}), 1, "deactivate")
    step("user activate", lambda: http("PATCH", f"/users/{uid}", tok, {"is_active": True}), 1, "activate")
    reset = step("user password reset", lambda: http("POST", f"/users/{uid}/reset-password", tok), 1,
                 "password_reset")
    secrets.append(reset["temporary_password"])
    step("unlock-login while not locked", lambda: http("POST", f"/users/{uid}/unlock-login", tok), 0)
    for _ in range(5):
        http("POST", "/auth/login", body={"email": "tmp.audit.user@karea.local", "password": "wrong-password-1"})
    step("unlock-login after 5 failed logins", lambda: http("POST", f"/users/{uid}/unlock-login", tok), 1,
         "login_unlock")
    step("user delete", lambda: http("DELETE", f"/users/{uid}", tok), 1, "delete")

    print("\n== 2. Roles and permission matrix (ROLE_PERMISSION_CHANGE) ==")
    role = step("role create", lambda: http("POST", "/roles", tok, {"code": "TMP_AUDIT_VIEWER",
                                                                  "name": "Geçici Denetim İzleyici"}),
                1, "create", "ROLE_PERMISSION_CHANGE")
    rid = role["id"]
    step("role grant analysis.view + web.access + vehicle.view",
         lambda: http("PUT", f"/roles/{rid}/permissions", tok,
                      {"permissions": ["analysis.view", "web.access", "vehicle.view"]}), 1, "grants_change")
    step("role revoke vehicle.view",
         lambda: http("PUT", f"/roles/{rid}/permissions", tok, {"permissions": ["analysis.view", "web.access"]}),
         1, "grants_change")
    step("role no-op grants", lambda: http("PUT", f"/roles/{rid}/permissions", tok,
                                           {"permissions": ["web.access", "analysis.view"]}), 0)

    print("\n== 3. Checklist templates (CHECKLIST_TEMPLATE_CHANGE) ==")
    item = step("template item create (shipment, section interior_fit)",
                lambda: http("POST", "/checklist-templates/4/items", tok,
                             {"ItemText": "TMP denetim maddesi", "SectionKey": "interior_fit"}),
                1, "create", "CHECKLIST_TEMPLATE_CHANGE")
    iid = item["ID"]
    step("template item text edit", lambda: http("PATCH", f"/checklist-templates/4/items/{iid}", tok,
                                                 {"ItemText": "TMP denetim maddesi (düzeltildi)"}), 1, "update")
    step("template item section change", lambda: http("PATCH", f"/checklist-templates/4/items/{iid}", tok,
                                                      {"SectionKey": "final_adjust"}), 1, "update")
    step("template item section cleared", lambda: http("PATCH", f"/checklist-templates/4/items/{iid}", tok,
                                                       {"ClearSection": True}), 1, "update")
    step("template item deactivate", lambda: http("PATCH", f"/checklist-templates/4/items/{iid}", tok,
                                                  {"IsActive": False}), 1, "deactivate")
    step("template item activate", lambda: http("PATCH", f"/checklist-templates/4/items/{iid}", tok,
                                                {"IsActive": True}), 1, "activate")
    _, items = http("GET", "/checklist-templates/4/items", tok)
    ids = [i["ID"] for i in items["items"]]
    order = [iid] + [i for i in ids if i != iid]
    step("template reorder (new item first)", lambda: http("POST", "/checklist-templates/4/items/reorder", tok,
                                                           {"ItemIDs": order}), 1, "reorder")
    step("template reorder unchanged", lambda: http("POST", "/checklist-templates/4/items/reorder", tok,
                                                    {"ItemIDs": order}), 0)
    step("template item delete", lambda: http("DELETE", f"/checklist-templates/4/items/{iid}", tok), 1, "delete")
    eol = step("eol item create (factory phase)", lambda: http("POST", "/checklist-templates/3/items", tok,
                                                              {"ItemText": "TMP EoL maddesi", "EolPhase": "BRANCH"}),
               1, "create")
    step("eol item phase change factory -> depot",
         lambda: http("PATCH", f"/checklist-templates/3/items/{eol['ID']}", tok, {"EolPhase": "DEPOT"}), 1, "update")
    step("eol item delete", lambda: http("DELETE", f"/checklist-templates/3/items/{eol['ID']}", tok), 1, "delete")

    print("\n== 4. Defect catalogue (DEFECT_CATALOG_CHANGE) ==")

    def body(row, **kw):
        b = {"code": row["Code"], "name_tr": row["NameTR"], "name_en": row["NameEN"],
             "sort_order": row["SortOrder"], "is_active": row["IsActive"]}
        if "ZoneID" in row:
            b["zone_id"] = row["ZoneID"]
        if "DefaultProcessID" in row:
            b["default_process_id"] = row["DefaultProcessID"]
        b.update(kw)
        return b

    proc = step("process create", lambda: http("POST", "/defect-processes", tok, {
        "code": "TMPPROC", "name_tr": "Geçici süreç", "name_en": "Temp process"}),
        1, "create", "DEFECT_CATALOG_CHANGE")
    step("process rename", lambda: http("PATCH", f"/defect-processes/{proc['ID']}", tok,
                                        body(proc, name_tr="Geçici süreç 2", name_en="Temp process 2")), 1, "update")
    proc.update(NameTR="Geçici süreç 2", NameEN="Temp process 2")
    step("process code change", lambda: http("PATCH", f"/defect-processes/{proc['ID']}", tok,
                                             body(proc, code="TMPPROC2")), 1, "update")
    proc.update(Code="TMPPROC2")
    step("process deactivate", lambda: http("PATCH", f"/defect-processes/{proc['ID']}", tok,
                                            body(proc, is_active=False)), 1, "deactivate")
    step("process activate", lambda: http("PATCH", f"/defect-processes/{proc['ID']}", tok,
                                          body(proc, is_active=True)), 1, "activate")
    step("process no-op update", lambda: http("PATCH", f"/defect-processes/{proc['ID']}", tok, body(proc)), 0)

    zone = step("zone create", lambda: http("POST", "/defect-zones", tok, {
        "code": "90", "name_tr": "Geçici bölge", "name_en": "Temp zone"}), 1, "create")
    step("zone rename + code change", lambda: http("PATCH", f"/defect-zones/{zone['ID']}", tok,
                                                   body(zone, code="91", name_tr="Geçici bölge 2")), 1, "update")
    zone.update(Code="91", NameTR="Geçici bölge 2")
    step("zone deactivate", lambda: http("PATCH", f"/defect-zones/{zone['ID']}", tok,
                                         body(zone, is_active=False)), 1, "deactivate")
    step("zone activate", lambda: http("PATCH", f"/defect-zones/{zone['ID']}", tok,
                                       body(zone, is_active=True)), 1, "activate")

    part = step("part create in temp zone", lambda: http("POST", "/defect-parts", tok, {
        "code": "91-01", "name_tr": "Geçici parça", "name_en": "Temp part", "zone_id": zone["ID"]}), 1, "create")
    step("part rename", lambda: http("PATCH", f"/defect-parts/{part['ID']}", tok,
                                     body(part, name_tr="Geçici parça 2")), 1, "update")
    part.update(NameTR="Geçici parça 2")
    step("part zone + code change (temp zone -> Body 10)",
         lambda: http("PATCH", f"/defect-parts/{part['ID']}", tok, body(part, zone_id=2, code="10-91")), 1, "update")
    part.update(ZoneID=2, Code="10-91")
    step("part deactivate", lambda: http("PATCH", f"/defect-parts/{part['ID']}", tok,
                                         body(part, is_active=False)), 1, "deactivate")
    step("part activate", lambda: http("PATCH", f"/defect-parts/{part['ID']}", tok,
                                       body(part, is_active=True)), 1, "activate")

    typ = step("defect type create (default process temp)", lambda: http("POST", "/defect-types", tok, {
        "code": "98", "name_tr": "Geçici kusur", "name_en": "Temp defect",
        "default_process_id": proc["ID"]}), 1, "create")
    step("defect type default process -> Montaj", lambda: http("PATCH", f"/defect-types/{typ['ID']}", tok,
                                                               body(typ, default_process_id=3)), 1, "update")
    typ.update(DefaultProcessID=3)
    step("defect type rename", lambda: http("PATCH", f"/defect-types/{typ['ID']}", tok,
                                            body(typ, name_tr="Geçici kusur 2", name_en="Temp defect 2")), 1, "update")
    typ.update(NameTR="Geçici kusur 2", NameEN="Temp defect 2")
    step("defect type deactivate", lambda: http("PATCH", f"/defect-types/{typ['ID']}", tok,
                                                body(typ, is_active=False)), 1, "deactivate")
    step("defect type activate", lambda: http("PATCH", f"/defect-types/{typ['ID']}", tok,
                                              body(typ, is_active=True)), 1, "activate")

    for kind, path, q in (("type", "/defect-types", ""), ("zone", "/defect-zones", ""),
                          ("process", "/defect-processes", ""), ("part", "/defect-parts", "?zone_id=2")):
        _, rows = http("GET", path + q, tok)
        lst = [r for r in rows["items"] if kind != "part" or r["ZoneID"] == 2]
        lst.sort(key=lambda r: (r["SortOrder"], r["ID"]))
        ids = [r["ID"] for r in lst]
        ids = [ids[-1]] + ids[:-1]
        step(f"{kind} reorder (last moved first)",
             lambda: http("POST", f"{path}/reorder{q}", tok, {"ids": ids}), 1, "reorder")

    step("part delete", lambda: http("DELETE", f"/defect-parts/{part['ID']}", tok), 1, "delete")
    step("defect type delete", lambda: http("DELETE", f"/defect-types/{typ['ID']}", tok), 1, "delete")
    step("zone delete", lambda: http("DELETE", f"/defect-zones/{zone['ID']}", tok), 1, "delete")
    step("process delete", lambda: http("DELETE", f"/defect-processes/{proc['ID']}", tok), 1, "delete")
    step("refused delete (process in use) writes nothing",
         lambda: (lambda s_b: (200 if s_b[0] == 409 else 500, s_b[1]))(http("DELETE", "/defect-processes/2", tok)), 0)

    print("\n== 5. No password or hash in any audit field ==")
    dump = psql(TEST_DB, "SELECT string_agg(concat_ws(' ', old_value, new_value, metadata::text), E'\\n') "
                         "FROM audit_logs")
    hashes = psql(TEST_DB, "SELECT string_agg(password_hash, ',') FROM users").split(",")
    check("no temporary password in audit_logs", not any(s in dump for s in secrets),
          f"{len(secrets)} plaintexts checked")
    check("no bcrypt hash ($2a$/$2b$/$2y$) in audit_logs",
          not any(p in dump for p in ("$2a$", "$2b$", "$2y$")) and not any(h and h in dump for h in hashes))
    keys = set()

    def walk(v):
        if isinstance(v, dict):
            for k, x in v.items():
                keys.add(k)
                walk(x)
        elif isinstance(v, list):
            for x in v:
                walk(x)
    pw_rows = [e for e in evidence if e["metadata"].get("action") == "password_reset"]
    for e in pw_rows:
        walk(e["metadata"])
    print(f"  password_reset row keys: {sorted(keys)}; old={pw_rows[0]['old_value']} new={pw_rows[0]['new_value']}")
    check("password_reset row has no password/hash key and no old/new value",
          not any("pass" in k or "hash" in k for k in keys)
          and pw_rows[0]["old_value"] == "<NULL>" and pw_rows[0]["new_value"] == "<NULL>")

    print("\n== 6. Activity endpoint visibility ==")
    status, all_rows = http("GET", "/audit/activity?limit=200", tok)
    types = sorted({r["EventType"] for r in all_rows["Items"]})
    print(f"  manager (admin.manage_users): {all_rows['Total']} rows, types {types}")
    check("manager sees all four management types", all(t in types for t in ADMIN_TYPES))
    for t in ADMIN_TYPES:
        s, page = http("GET", f"/audit/activity?event_type={t}&limit=200", tok)
        check(f"manager filter {t}: only that type",
              s == 200 and page["Total"] > 0 and all(r["EventType"] == t for r in page["Items"]),
              f"{page['Total']} rows")
    created = http("POST", "/users", tok, {"full_name": "Tmp Analiz İzleyici",
                                           "email": "tmp.audit.viewer@karea.local", "role": "TMP_AUDIT_VIEWER"})[1]
    secrets.append(created["temporary_password"])
    vtok = login("tmp.audit.viewer@karea.local", created["temporary_password"])
    s, b = http("POST", "/auth/change-password", vtok, {"current_password": created["temporary_password"],
                                                        "new_password": "Kq7#mZr4!pLw9",
                                                        "confirm_password": "Kq7#mZr4!pLw9"})
    if s >= 300:
        raise SystemExit(f"viewer change-password failed: {s} {b}")
    secrets.append("Kq7#mZr4!pLw9")
    vtok = login("tmp.audit.viewer@karea.local", "Kq7#mZr4!pLw9")
    s, vrows = http("GET", "/audit/activity?limit=200", vtok)
    vtypes = sorted({r["EventType"] for r in vrows["Items"]})
    print(f"  viewer (analysis.view only): HTTP {s}, {vrows['Total']} rows, types {vtypes}")
    check("viewer list hides user/role events, keeps template/catalogue",
          s == 200 and "USER_ADMIN_CHANGE" not in vtypes and "ROLE_PERMISSION_CHANGE" not in vtypes
          and "CHECKLIST_TEMPLATE_CHANGE" in vtypes and "DEFECT_CATALOG_CHANGE" in vtypes)
    for t in ("USER_ADMIN_CHANGE", "ROLE_PERMISSION_CHANGE"):
        s, b = http("GET", f"/audit/activity?event_type={t}", vtok)
        check(f"viewer asking for {t}: 403", s == 403, f"HTTP {s} {str(b)[:80]}")
    s, b = http("GET", "/audit/activity?event_type=DEFECT_CATALOG_CHANGE&limit=200", vtok)
    check("viewer asking for DEFECT_CATALOG_CHANGE: 200 with rows", s == 200 and b["Total"] > 0, f"{b['Total']} rows")
    s, home = http("GET", "/home/overview", tok)
    htypes = sorted({r["EventType"] for r in (home.get("Activity") or [])})
    check("home overview activity excludes management events",
          s == 200 and not any(t in htypes for t in ADMIN_TYPES), f"types {htypes}")
    check("viewer temp/new passwords not in audit_logs",
          not any(x in psql(TEST_DB, "SELECT COALESCE(string_agg(concat_ws(' ', old_value, new_value, "
                                     "metadata::text), ' '), '') FROM audit_logs") for x in secrets))

    with open(f"{OUT}/api-activity-manager.json", "w") as f:
        json.dump(all_rows, f, ensure_ascii=False, indent=1)
    with open(f"{OUT}/api-activity-viewer.json", "w") as f:
        json.dump(vrows, f, ensure_ascii=False, indent=1)
    with open(f"{OUT}/audit-rows.json", "w") as f:
        json.dump(evidence, f, ensure_ascii=False, indent=1)
    print(f"\n  saved api-activity-manager.json, api-activity-viewer.json, audit-rows.json ({len(evidence)} rows)")


def phase_drop():
    psql("postgres", f"DROP DATABASE IF EXISTS {TEST_DB};")
    print(f"  dropped {TEST_DB}")


if __name__ == "__main__":
    {"db": phase_db, "api": phase_api, "drop": phase_drop}[sys.argv[1]]()
    print(f"\n{'ALL CHECKS PASSED' if not failures else 'FAILED: ' + '; '.join(failures)}")
    sys.exit(1 if failures else 0)
