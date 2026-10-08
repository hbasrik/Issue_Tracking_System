#!/usr/bin/env python3
"""Issue list opening-date filter (docs/16 A57). Test database + test API only.

  python3 run-verification.py fixtures  insert TMP-DATEFILTER issues at known
                                        Europe/Istanbul times on
                                        karea_eolnote_test (ids in
                                        /tmp/karea-datefilter/state.json)
  python3 run-verification.py api       GET /issues on the test API (:18081)
                                        per range; the returned ids must equal
                                        an independent SQL day test
  python3 run-verification.py cleanup   DELETE the TMP-DATEFILTER issues

Built for plant day 2026-10-08 (the fixtures sit on that day's preset
boundaries); refuses to run on another day. The live database and the API on
8080 are never used.
"""
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

PSQL = "/opt/homebrew/opt/libpq/bin/psql"
DB = "postgres://karea:karea_secret@localhost:5432/karea_eolnote_test?sslmode=disable"
API = "http://localhost:18081/api/v1"
STATE = "/tmp/karea-datefilter/state.json"
MARK = "TMP-DATEFILTER"
TODAY = "2026-10-08"

assert ":8080" not in API
assert DB.split("?")[0].endswith("_test")

# label -> (Istanbul wall time, severity)
FIXTURES = {
    "A today 00:00:00 (first of today)": ("2026-10-08 00:00:00", "CRITICAL"),
    "B yesterday 23:59:59.999": ("2026-10-07 23:59:59.999", "LOW"),
    "C today 01:30 (UTC day 7 Oct)": ("2026-10-08 01:30:00", "MEDIUM"),
    "D 2 Oct 00:00:00 (first of Son 7 gün)": ("2026-10-02 00:00:00", "CRITICAL"),
    "E 1 Oct 23:59:59.999": ("2026-10-01 23:59:59.999", "MEDIUM"),
    "F 1 Oct 00:00:00 (first of Bu ay)": ("2026-10-01 00:00:00", "LOW"),
    "G 30 Sep 23:59:59.999 (last of custom end day)": ("2026-09-30 23:59:59.999", "CRITICAL"),
    "H 28 Sep 00:00:00 (first of custom start day)": ("2026-09-28 00:00:00", "MEDIUM"),
    "I 27 Sep 23:59:59.999": ("2026-09-27 23:59:59.999", "LOW"),
}
BULK_DAY = "2026-09-29"
BULK_N = 55

failures = []


def check(label, ok, detail=""):
    print(f"  [{'PASS' if ok else 'FAIL'}] {label}" + (f" — {detail}" if detail else ""))
    if not ok:
        failures.append(label)


def sql(q):
    out = subprocess.run([PSQL, DB, "-X", "-v", "ON_ERROR_STOP=1", "-At", "-F", "|", "-c", q],
                         capture_output=True, text=True)
    if out.returncode != 0:
        sys.exit(out.stderr)
    return out.stdout.strip()


def plant_today():
    return sql("SELECT (now() AT TIME ZONE 'Europe/Istanbul')::date")


def insert(label, local, severity):
    return int(sql(f"""
        INSERT INTO issue_list (vin, source_type, source_station_step_id, source_check_item_id, station_id,
                                issue_type_id, severity, description, status, issue_reporter_id,
                                defect_part_id, defect_type_id, responsible_process_id, issue_date, created_at)
        SELECT vin, source_type, source_station_step_id, source_check_item_id, station_id,
               issue_type_id, '{severity}', '{MARK} {label}', 'OPEN', issue_reporter_id,
               defect_part_id, defect_type_id, responsible_process_id,
               '{local}'::timestamp AT TIME ZONE 'Europe/Istanbul',
               '{local}'::timestamp AT TIME ZONE 'Europe/Istanbul'
        FROM issue_list WHERE id = 1
        RETURNING id""").splitlines()[0])


def fixtures():
    if plant_today() != TODAY:
        sys.exit(f"plant day is {plant_today()}, fixtures are built for {TODAY}")
    if sql(f"SELECT count(*) FROM issue_list WHERE description LIKE '{MARK}%'") != "0":
        sys.exit("TMP-DATEFILTER issues already exist; run cleanup first")
    ids = {}
    for label, (local, sev) in FIXTURES.items():
        ids[label] = insert(label, local, sev)
    bulk = []
    for i in range(BULK_N):
        local = f"{BULK_DAY} {8 + i // 60:02d}:{i % 60:02d}:00"
        bulk.append(insert(f"J{i + 1:02d} {BULK_DAY}", local, ["CRITICAL", "MEDIUM", "LOW"][i % 3]))
    os.makedirs(os.path.dirname(STATE), exist_ok=True)
    json.dump({"ids": ids, "bulk": bulk}, open(STATE, "w"), indent=1)
    print(f"inserted {len(ids) + len(bulk)} {MARK} issues (copies of seed issue 1, vin N7V1K1SA2TK000004)")
    print(sql(f"""
        SELECT id, to_char(issue_date AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD HH24:MI:SS.MS') || ' Istanbul',
               to_char(issue_date AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS.MS') || ' UTC', severity, description
        FROM issue_list WHERE description LIKE '{MARK}%' AND description NOT LIKE '{MARK} J%' ORDER BY issue_date"""))
    print(f"+ {BULK_N} on {BULK_DAY} 08:00–08:54 Istanbul (J01–J{BULK_N})")


def login():
    req = urllib.request.Request(f"{API}/auth/login", data=json.dumps(
        {"email": "manager@karea.local", "password": "changeme123"}).encode(),
        headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req).read())["token"]


def get(token, query):
    req = urllib.request.Request(f"{API}/issues?{query}", headers={"Authorization": f"Bearer {token}"})
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"null")


def expected(where):
    rows = sql(f"SELECT id FROM issue_list WHERE {where} ORDER BY issue_date DESC, id DESC")
    return [int(x) for x in rows.splitlines() if x]


def local_day(cond):
    return f"(issue_date AT TIME ZONE 'Europe/Istanbul')::date {cond}"


def api():
    if plant_today() != TODAY:
        sys.exit(f"plant day is {plant_today()}, expected {TODAY}")
    state = json.load(open(STATE))
    names = {v: k.split(" ")[0] for k, v in state["ids"].items()}
    names.update({v: "J" for v in state["bulk"]})
    tag = lambda ids: " ".join(sorted({names.get(i, f"seed#{i}") for i in ids} - {"J"})) + (
        f" + {sum(1 for i in ids if names.get(i) == 'J')}×J" if any(names.get(i) == "J" for i in ids) else "")
    token = login()

    cases = [
        ("Bugün (08.10)", "opened_from=2026-10-08&opened_to=2026-10-08",
         local_day("= '2026-10-08'")),
        ("Son 7 gün (02.10–08.10)", "opened_from=2026-10-02&opened_to=2026-10-08",
         local_day("BETWEEN '2026-10-02' AND '2026-10-08'")),
        ("Bu ay (01.10–08.10)", "opened_from=2026-10-01&opened_to=2026-10-08",
         local_day("BETWEEN '2026-10-01' AND '2026-10-08'")),
        ("ikisi birden 28.09–30.09", "opened_from=2026-09-28&opened_to=2026-09-30",
         local_day("BETWEEN '2026-09-28' AND '2026-09-30'")),
        ("yalnız başlangıç 01.10", "opened_from=2026-10-01", local_day(">= '2026-10-01'")),
        ("yalnız bitiş 30.09", "opened_to=2026-09-30", local_day("<= '2026-09-30'")),
        ("Son 7 gün + durum OPEN,IN_PROGRESS", "status=OPEN,IN_PROGRESS&opened_from=2026-10-02&opened_to=2026-10-08",
         local_day("BETWEEN '2026-10-02' AND '2026-10-08'") + " AND status IN ('OPEN','IN_PROGRESS')"),
        ("boş aralık 01.08–02.08", "opened_from=2026-08-01&opened_to=2026-08-02",
         local_day("BETWEEN '2026-08-01' AND '2026-08-02'")),
    ]
    print("== API ids vs SQL day test ((issue_date AT TIME ZONE 'Europe/Istanbul')::date)")
    for label, query, where in cases:
        status, body = get(token, query)
        got = [i["ID"] for i in body["items"]] if status == 200 else None
        want = expected(where)
        check(f"{label}: {len(want)} issues", status == 200 and got == want,
              f"status {status}, {tag(got or [])}" if got == want else f"got {got} want {want}")

    print("== boundaries")
    s, today = get(token, "opened_from=2026-10-08&opened_to=2026-10-08")
    ids = {i["ID"] for i in today["items"]}
    A, B, C = (state["ids"][k] for k in list(FIXTURES)[:3])
    check("Bugün includes 00:00:00 local (A) and 01:30 local whose UTC day is 7 Oct (C)", {A, C} <= ids)
    check("Bugün excludes yesterday 23:59:59.999 local (B)", B not in ids)
    utc_cut = expected("(issue_date AT TIME ZONE 'UTC')::date = '2026-10-08'")
    print(f"     a UTC day cut would return {tag(utc_cut) or 'nothing'} instead of {tag(sorted(ids))}")
    s, custom = get(token, "opened_from=2026-09-28&opened_to=2026-09-30")
    ids = {i["ID"] for i in custom["items"]}
    G, H, I = (state["ids"][k] for k in list(FIXTURES)[6:9])
    F = state["ids"][list(FIXTURES)[5]]
    check("28–30 Sep includes the start day's first record (H 28 Sep 00:00:00)", H in ids)
    check("28–30 Sep includes the end day's last record (G 30 Sep 23:59:59.999)", G in ids)
    check("28–30 Sep excludes 27 Sep 23:59:59.999 (I) and 1 Oct 00:00 (F)", I not in ids and F not in ids)

    print("== board paging keeps the range (limit 50 + keyset)")
    s, p1 = get(token, "opened_from=2026-09-28&opened_to=2026-09-30&limit=50")
    s2, p2 = get(token, "opened_from=2026-09-28&opened_to=2026-09-30&limit=50"
                        f"&before_date={p1['next_before_date']}&before_id={p1['next_before_id']}")
    paged = [i["ID"] for i in p1["items"] + p2["items"]]
    check("page 1 has 50 and has_more", len(p1["items"]) == 50 and p1["has_more"] is True)
    check("page 1 + page 2 = the full range, no extra row", paged == [i["ID"] for i in custom["items"]] and p2["has_more"] is False,
          f"{len(paged)} rows")

    print("== rejected input")
    for query, want in [("opened_from=2026-10-08&opened_to=2026-10-01", "opened_from must not be after opened_to"),
                        ("opened_from=08.10.2026", "opened_from and opened_to must be YYYY-MM-DD")]:
        s, body = get(token, query)
        check(f"{query} -> 400", s == 400 and want in json.dumps(body), f"{s} {body}")

    print("\nALL CHECKS PASSED" if not failures else f"\nFAILED: {failures}")
    sys.exit(1 if failures else 0)


def cleanup():
    n = sql(f"WITH d AS (DELETE FROM issue_list WHERE description LIKE '{MARK}%' RETURNING id) SELECT count(*) FROM d")
    print(f"deleted {n} {MARK} issues; left:",
          sql(f"SELECT count(*) FROM issue_list WHERE description LIKE '{MARK}%'"))


if __name__ == "__main__":
    {"fixtures": fixtures, "api": api, "cleanup": cleanup}[sys.argv[1]]()
