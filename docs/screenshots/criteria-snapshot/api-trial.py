#!/usr/bin/env python3
"""Answer copy of criterion / method / revision (docs/11 Karar 30), test only.

  python3 api-trial.py setup     marked 'tmp-snap' template items + rows on an
                                 open Branch vehicle, answers through the test
                                 API (:18081 -> karea_eolnote_test), checks
  python3 api-trial.py cleanup   delete exactly what setup created

Never live, never :8080. Fixtures (all on N7V1K1SAXTK000008, EOL template):
  9301 answered   OK, template revised, NOT_OK, template revised again
  9302 none       no criterion / method / revision on the form, OK
  9303 legacy     answered row inserted without a copy (as before 0042)
  9304 pending    criterion + method + revision on the template, never answered
Frozen: a seeded branch row of the branch-shipped N7V1K1SA1TK000012 is only
read; every write attempt is refused and its md5 is compared.
"""
import json
import subprocess
import sys
import urllib.error
import urllib.request

PSQL = "/opt/homebrew/opt/libpq/bin/psql"
DB = "postgres://karea:karea_secret@localhost:5432/karea_eolnote_test?sslmode=disable"
API = "http://localhost:18081/api/v1"
VIN = "N7V1K1SAXTK000008"
FROZEN_VIN = "N7V1K1SA1TK000012"
STATE = "/tmp/karea-snap/state.json"
failures = []


def q(sql, ok_fail=False):
    r = subprocess.run([PSQL, DB, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-At", "-F", "|", "-c", sql],
                       capture_output=True, text=True)
    if ok_fail:
        return r.returncode, r.stdout.strip(), r.stderr.strip()
    if r.returncode != 0:
        raise SystemExit(f"psql: {r.stderr.strip()}")
    return r.stdout.strip()


def check(label, ok, detail=""):
    print(f"  [{'PASS' if ok else 'FAIL'}] {label}" + (f" — {detail}" if detail else ""))
    if not ok:
        failures.append(label)


def call(method, path, token=None, body=None):
    req = urllib.request.Request(API + path, data=json.dumps(body).encode() if body is not None else None,
                                 method=method)
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


ROW = ("SELECT check_status, coalesce(item_text_snapshot, '<NULL>'), coalesce(acceptance_criterion_snapshot, '<NULL>'), "
       "coalesce(control_method_snapshot, '<NULL>'), coalesce(form_revision_snapshot, '<NULL>'), "
       "coalesce(to_char(criteria_snapshot_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS.US'), '<NULL>') "
       "FROM checklist_item_progress WHERE vin = '{vin}' AND check_item_id = {item}")
COLS = ["check_status", "item_text_snapshot", "acceptance_criterion_snapshot", "control_method_snapshot",
        "form_revision_snapshot", "criteria_snapshot_at"]


def row(item, vin=VIN):
    return dict(zip(COLS, q(ROW.format(vin=vin, item=item)).split("|")))


def side_by_side(before, after):
    w = max(len(v) for v in before.values()) + 2
    print(f"    {'column':31s} {'before':{w}s} after")
    for c in COLS:
        mark = "  (changed)" if before[c] != after[c] else ""
        print(f"    {c:31s} {before[c]:{w}s} {after[c]}{mark}")


def login():
    st, s = call("POST", "/auth/login", body={"email": "manager@karea.local", "password": "changeme123"})
    if st != 200:
        raise SystemExit(f"login {st} {s}")
    return s.get("access_token") or s["token"]


def set_template(item, criterion, method, revision, text=None):
    lit = lambda v: "NULL" if v is None else "'" + v.replace("'", "''") + "'"
    q(f"UPDATE checklist_template_items SET acceptance_criterion = {lit(criterion)}, control_method = {lit(method)}, "
      f"form_revision = {lit(revision)}" + (f", item_text = {lit(text)}" if text else "") +
      f" WHERE id = {item} AND item_text LIKE 'tmp-snap%'")


def setup():
    tok = login()
    tid = q(f"SELECT eol_template_id FROM vehicles WHERE vin = '{VIN}'")
    audit_max = q("SELECT coalesce(max(id), 0) FROM audit_logs")
    ids = {}
    for no, key, crit, meth, rev in [
        (9301, "answered", "Boşluk 3–5 mm", "Görsel", "Rev. 02"),
        (9302, "none", None, None, None),
        (9303, "legacy", "Eski kriter (kopyasız cevap)", "Eski yöntem", "Rev. 01"),
        (9304, "pending", "Conta boyunca boşluk yok", "Görsel + el ile", "Rev. 05"),
    ]:
        lit = lambda v: "NULL" if v is None else "'" + v + "'"
        ids[key] = int(q(f"INSERT INTO checklist_template_items (template_id, item_no, item_text, eol_phase, is_active, "
                         f"acceptance_criterion, control_method, form_revision) VALUES ({tid}, {no}, "
                         f"'tmp-snap {key}', 'BRANCH', true, {lit(crit)}, {lit(meth)}, {lit(rev)}) RETURNING id"))
        if key == "legacy":
            q(f"INSERT INTO checklist_item_progress (vin, checklist_type, check_item_id, check_status, checker_id, "
              f"check_date, approved_by, approved_date) VALUES ('{VIN}', 'EOL', {ids[key]}, 'OK', 1, now(), 1, now())")
        else:
            q(f"INSERT INTO checklist_item_progress (vin, checklist_type, check_item_id, check_status) "
              f"VALUES ('{VIN}', 'EOL', {ids[key]}, 'PENDING')")
    frozen_item = int(q(f"SELECT p.check_item_id FROM checklist_item_progress p JOIN checklist_template_items c "
                        f"ON c.id = p.check_item_id WHERE p.vin = '{FROZEN_VIN}' AND c.eol_phase = 'BRANCH' "
                        f"AND p.check_status = 'OK' ORDER BY c.item_no LIMIT 1"))
    with open(STATE, "w") as f:
        json.dump({"ids": ids, "audit_max": int(audit_max), "frozen_item": frozen_item}, f)
    print(f"fixtures on {VIN}: {ids}; audit baseline id {audit_max}")

    rec = lambda item, status, note="": call("POST", f"/vehicles/{VIN}/checklist/eol/{item}", tok,
                                            {"status": status, "note": note})

    print("\n== 1. answer: the four columns are filled and stamped")
    a = ids["answered"]
    pending = row(a)
    st, _ = rec(a, "OK")
    first = row(a)
    side_by_side(pending, first)
    check("POST OK 200", st == 200, str(st))
    check("criterion, method, revision copied, stamp written",
          (first["acceptance_criterion_snapshot"], first["control_method_snapshot"], first["form_revision_snapshot"])
          == ("Boşluk 3–5 mm", "Görsel", "Rev. 02") and first["criteria_snapshot_at"] != "<NULL>")

    print("\n== 2. template revised, answer changes: the copy is renewed")
    set_template(a, "Boşluk 2–4 mm", "Kumpas", "Rev. 03", text="tmp-snap answered (metin rev. 03)")
    st, _ = rec(a, "NOT_OK", "boşluk 6 mm ölçüldü")
    second = row(a)
    side_by_side(first, second)
    check("POST NOT_OK 200", st == 200, str(st))
    check("copy renewed to the revised template",
          (second["acceptance_criterion_snapshot"], second["control_method_snapshot"], second["form_revision_snapshot"],
           second["item_text_snapshot"]) == ("Boşluk 2–4 mm", "Kumpas", "Rev. 03", "tmp-snap answered (metin rev. 03)"))
    check("stamp moved forward", second["criteria_snapshot_at"] > first["criteria_snapshot_at"],
          f"{first['criteria_snapshot_at']} -> {second['criteria_snapshot_at']}")
    # Revised again after the answer: screens must show the copy (record) and
    # the template (open card) apart.
    set_template(a, "Boşluk 1–3 mm", "Mikrometre", "Rev. 04")

    print("\n== 3. item without criteria: stamp set, copies NULL")
    st, _ = rec(ids["none"], "OK")
    none = row(ids["none"])
    print("    " + json.dumps(none, ensure_ascii=False))
    check("POST OK 200", st == 200, str(st))
    check("stamp set, three copies NULL", none["criteria_snapshot_at"] != "<NULL>" and
          (none["acceptance_criterion_snapshot"], none["control_method_snapshot"], none["form_revision_snapshot"])
          == ("<NULL>", "<NULL>", "<NULL>"))

    print("\n== 4. API: template fields current, copy separate")
    _, res = call("GET", f"/vehicles/{VIN}/checklist/eol", tok)
    by = {i["ItemID"]: i for i in res["items"]}
    pick = lambda i: {k: i.get(k) for k in ["Status", "ItemText", "AcceptanceCriterion", "ControlMethod",
                                            "FormRevision", "AnsweredCriteria"]}
    for key in ["answered", "none", "legacy", "pending"]:
        print(f"    {key:9s} " + json.dumps(pick(by[ids[key]]), ensure_ascii=False))
    ans = by[ids["answered"]]
    check("answered: template fields = current template (Rev. 04)",
          (ans["AcceptanceCriterion"], ans["ControlMethod"], ans["FormRevision"]) == ("Boşluk 1–3 mm", "Mikrometre", "Rev. 04"))
    check("answered: AnsweredCriteria = copy (Rev. 03)", ans.get("AnsweredCriteria") is not None and
          (ans["AnsweredCriteria"].get("AcceptanceCriterion"), ans["AnsweredCriteria"].get("ControlMethod"),
           ans["AnsweredCriteria"].get("FormRevision")) == ("Boşluk 2–4 mm", "Kumpas", "Rev. 03"))
    check("none: AnsweredCriteria present with no values",
          by[ids["none"]].get("AnsweredCriteria") is not None and
          set(by[ids["none"]]["AnsweredCriteria"]) == {"CopiedAt"})
    check("legacy: no AnsweredCriteria (template still in its own fields)",
          "AnsweredCriteria" not in by[ids["legacy"]] and by[ids["legacy"]]["AcceptanceCriterion"] == "Eski kriter (kopyasız cevap)")
    check("pending: no AnsweredCriteria, template with revision",
          "AnsweredCriteria" not in by[ids["pending"]] and by[ids["pending"]]["FormRevision"] == "Rev. 05")

    print("\n== 5. frozen item: API 409 and direct SQL refused, md5 unchanged")
    fi = frozen_item
    md5 = lambda: q(f"SELECT md5(p::text) FROM checklist_item_progress p WHERE vin = '{FROZEN_VIN}' AND check_item_id = {fi}")
    before = md5()
    fr = row(fi, FROZEN_VIN)
    print(f"    {FROZEN_VIN} item {fi}: " + json.dumps(fr, ensure_ascii=False))
    for status, note in [("OK", ""), ("NOT_OK", "frozen probe")]:
        st, body = call("POST", f"/vehicles/{FROZEN_VIN}/checklist/eol/{fi}", tok, {"status": status, "note": note})
        check(f"API POST {status} on frozen item -> 409", st == 409, f"{st} {json.dumps(body, ensure_ascii=False)}")
    for set_ in ["acceptance_criterion_snapshot = 'x', criteria_snapshot_at = now()",
                 "control_method_snapshot = 'x', criteria_snapshot_at = now()",
                 "form_revision_snapshot = 'x', criteria_snapshot_at = now()",
                 "criteria_snapshot_at = now()"]:
        code, _, err = q(f"UPDATE checklist_item_progress SET {set_} WHERE vin = '{FROZEN_VIN}' AND check_item_id = {fi}",
                         ok_fail=True)
        check(f"SQL SET {set_.split(' =')[0]} refused", code != 0 and "shipped from the branch" in err,
              err.splitlines()[0] if err else "accepted")
    after = md5()
    check("frozen row md5 unchanged", after == before, f"{before} -> {after}")

    print("\nRESULT:", "ALL PASS" if not failures else f"{len(failures)} FAIL: {failures}")
    return 1 if failures else 0


def cleanup():
    with open(STATE) as f:
        s = json.load(f)
    ids = ",".join(str(v) for v in s["ids"].values())
    media = q(f"SELECT count(*) FROM media_attachments m JOIN checklist_item_progress p ON m.entity_id = p.id::text "
              f"WHERE m.entity_type = 'CHECKLIST_ITEM_PROGRESS' AND p.check_item_id IN ({ids})")
    audit = q(f"DELETE FROM audit_logs WHERE id > {s['audit_max']} AND vin = '{VIN}' RETURNING id")
    other = q(f"SELECT count(*) FROM audit_logs WHERE id > {s['audit_max']}")
    prog = q(f"DELETE FROM checklist_item_progress WHERE check_item_id IN ({ids}) RETURNING id")
    items = q(f"DELETE FROM checklist_template_items WHERE id IN ({ids}) AND item_text LIKE 'tmp-snap%' RETURNING id")
    print(f"deleted: {len(audit.split()) if audit else 0} audit, {len(prog.split()) if prog else 0} progress, "
          f"{len(items.split()) if items else 0} template items; media on fixtures before delete: {media}; "
          f"audit rows after baseline left: {other}")
    left = q("SELECT (SELECT count(*) FROM checklist_template_items WHERE item_text LIKE 'tmp-snap%') || ' items, ' || "
             f"(SELECT count(*) FROM checklist_item_progress WHERE check_item_id IN ({ids})) || ' progress, ' || "
             f"(SELECT count(*) FROM audit_logs WHERE id > {s['audit_max']}) || ' audit'")
    print(f"left: {left}")
    return 0 if left == "0 items, 0 progress, 0 audit" else 1


if __name__ == "__main__":
    sys.exit({"setup": setup, "cleanup": cleanup}[sys.argv[1]]())
