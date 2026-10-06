#!/usr/bin/env python3
"""old_note / new_note in CHECKLIST_ITEM_UPDATE metadata (docs/16 A46).

Runs on the test API (18081) and karea_eolnote_test only: walks one PENDING
EoL item through OK+note, NOT_OK+note, OK without note, CONDITIONAL_OK+note
and prints the audit row each step wrote. Existing audit rows are hashed
before and after to show they were not touched. Never uses the live database
or the API on 8080.
"""
import json
import subprocess
import urllib.request

PSQL = "/opt/homebrew/opt/libpq/bin/psql"
URL = "postgres://karea:karea_secret@localhost:5432/karea_eolnote_test?sslmode=disable"
API = "http://localhost:18081/api/v1"
failures = []


def psql(sql):
    r = subprocess.run([PSQL, URL, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-At", "-F", "|", "-c", sql],
                       capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit(r.stderr.strip())
    return r.stdout.strip()


def call(method, path, token=None, body=None):
    req = urllib.request.Request(API + path, data=json.dumps(body).encode() if body is not None else None,
                                 method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"null")


def check(label, ok, detail=""):
    print(f"  [{'PASS' if ok else 'FAIL'}] {label}" + (f" — {detail}" if detail else ""))
    if not ok:
        failures.append(label)


SNAPSHOT = ("SELECT count(*) || '|' || coalesce(max(id), 0) || '|' || "
            "md5(coalesce(string_agg(id || ':' || event_type || ':' || coalesce(old_value, '') || ':' || "
            "coalesce(new_value, '') || ':' || coalesce(metadata::text, ''), ',' ORDER BY id), '')) "
            "FROM audit_logs WHERE id <= {max_id}")

before_count, max_id, before_md5 = psql(SNAPSHOT.format(max_id="(SELECT max(id) FROM audit_logs)")).split("|")
print(f"existing audit_logs: {before_count} rows, max id {max_id}, md5 {before_md5}")

_, login = call("POST", "/auth/login", body={"email": "manager@karea.local", "password": "changeme123"})
tok = login["token"]
vin, item = psql(
    "SELECT p.vin, p.check_item_id FROM checklist_item_progress p "
    "JOIN checklist_template_items cti ON cti.id = p.check_item_id "
    "JOIN vehicle_eol_workflow w ON w.vin = p.vin "
    "WHERE p.checklist_type = 'EOL' AND p.check_status = 'PENDING' "
    "AND cti.eol_phase = 'BRANCH' AND w.current_stage = 'BRANCH' "
    "AND NOT EXISTS (SELECT 1 FROM media_attachments m WHERE m.entity_type = 'CHECKLIST_ITEM_PROGRESS' "
    "                AND m.entity_id = p.id::text) "
    "ORDER BY p.vin, cti.item_no LIMIT 1").split("|")
print(f"fixture: vin={vin} item={item} (seeded test vehicle, test DB)\n")

steps = [
    ("OK", "ölçüm 12.6", None, "ölçüm 12.6"),
    ("NOT_OK", "conta yırtık", "ölçüm 12.6", "conta yırtık"),
    ("OK", None, "conta yırtık", None),
    ("CONDITIONAL_OK", "paspas sonra", None, "paspas sonra"),
]
for i, (status, note, want_old, want_new) in enumerate(steps, 1):
    body = {"status": status}
    if note is not None:
        body["note"] = note
    st, res = call("POST", f"/vehicles/{vin}/checklist/eol/{item}", tok, body)
    row = psql("SELECT id, old_value, new_value, metadata::text FROM audit_logs "
               f"WHERE event_type = 'CHECKLIST_ITEM_UPDATE' AND vin = '{vin}' AND id > {max_id} "
               "ORDER BY id DESC LIMIT 1")
    aid, old, new, meta = row.split("|", 3)
    md = json.loads(meta)
    print(f"step {i} POST {json.dumps(body, ensure_ascii=False)} -> {st}")
    print(f"  audit id={aid} {old} -> {new} metadata={meta}")
    check("HTTP 200", st == 200, json.dumps(res, ensure_ascii=False) if st != 200 else "")
    check(f"old_note {'absent' if want_old is None else repr(want_old)}",
          md.get("old_note") == want_old and (want_old is not None or "old_note" not in md))
    check(f"new_note {'absent' if want_new is None else repr(want_new)}",
          md.get("new_note") == want_new and (want_new is not None or "new_note" not in md))
    check("no empty-string note key", "" not in (md.get("old_note"), md.get("new_note")))
    check("only item_id/checklist_type/old_note/new_note keys",
          set(md) <= {"item_id", "checklist_type", "old_note", "new_note"}, ",".join(sorted(md)))

after_count, _, after_md5 = psql(SNAPSHOT.format(max_id=max_id)).split("|")
print(f"\nexisting audit_logs after: {after_count} rows (id <= {max_id}), md5 {after_md5}")
check("pre-existing audit rows unchanged", (after_count, after_md5) == (before_count, before_md5))
print("\nALL CHECKS PASSED" if not failures else f"\nFAILED: {failures}")
raise SystemExit(1 if failures else 0)
