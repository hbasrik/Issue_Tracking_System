#!/usr/bin/env python3
"""Issue board vs Analysis on the same day range (docs/16 A60). Test only.

  python3 compare.py fixtures        insert TMP-PLANTDAY issues at known
                                     Europe/Istanbul times (karea_eolnote_test)
  python3 compare.py measure LABEL   ask the test API (:18081) for each range:
                                     board total (GET /issues?opened_from&
                                     opened_to) and Analysis "opened"
                                     (GET /analysis/dashboard?from&to:
                                     Cards.OpenedIssues, Sparklines.Opened);
                                     saved to /tmp/karea-plantday/LABEL.json
  python3 compare.py report          before / after side by side
  python3 compare.py cleanup         DELETE the TMP-PLANTDAY issues

The expected count per range is an independent SQL day test
((issue_date AT TIME ZONE 'Europe/Istanbul')::date). Never live, never :8080.
"""
import json
import os
import subprocess
import sys
import urllib.request

PSQL = "/opt/homebrew/opt/libpq/bin/psql"
DB = "postgres://karea:karea_secret@localhost:5432/karea_eolnote_test?sslmode=disable"
API = "http://localhost:18081/api/v1"
STATE = "/tmp/karea-plantday"
MARK = "TMP-PLANTDAY"

assert ":8080" not in API and DB.split("?")[0].endswith("_test")

# label -> Istanbul wall time. Mid-September 2026 holds no seed issue.
FIXTURES = {
    "P 14 Sep 23:59:59.999 (day before)": "2026-09-14 23:59:59.999",
    "Q 15 Sep 00:00:00 (first of start day, UTC 14 Sep)": "2026-09-15 00:00:00",
    "R 15 Sep 01:30 (UTC 14 Sep)": "2026-09-15 01:30:00",
    "S 16 Sep 02:00 (UTC 15 Sep)": "2026-09-16 02:00:00",
    "T 16 Sep 23:59:59.999 (last of end day)": "2026-09-16 23:59:59.999",
    "U 17 Sep 00:00:00 (day after, UTC 16 Sep)": "2026-09-17 00:00:00",
    "V 17 Sep 03:00 (day after, UTC 17 Sep)": "2026-09-17 03:00:00",
}

RANGES = [
    ("15–16 Sep", "2026-09-15", "2026-09-16"),
    ("15 Sep", "2026-09-15", "2026-09-15"),
    ("16 Sep", "2026-09-16", "2026-09-16"),
    ("from 15 Sep", "2026-09-15", None),
    ("to 16 Sep", None, "2026-09-16"),
    ("1–8 Oct (seed)", "2026-10-01", "2026-10-08"),
]


def sql(q):
    out = subprocess.run([PSQL, DB, "-X", "-v", "ON_ERROR_STOP=1", "-At", "-F", "|", "-c", q],
                         capture_output=True, text=True)
    if out.returncode != 0:
        sys.exit(out.stderr)
    return out.stdout.strip()


def fixtures():
    if sql(f"SELECT count(*) FROM issue_list WHERE description LIKE '{MARK}%'") != "0":
        sys.exit("TMP-PLANTDAY issues already exist; run cleanup first")
    for label, local in FIXTURES.items():
        sql(f"""
            INSERT INTO issue_list (vin, source_type, source_station_step_id, source_check_item_id, station_id,
                                    issue_type_id, severity, description, status, issue_reporter_id,
                                    defect_part_id, defect_type_id, responsible_process_id, issue_date, created_at)
            SELECT vin, source_type, source_station_step_id, source_check_item_id, station_id,
                   issue_type_id, severity, '{MARK} {label}', 'OPEN', issue_reporter_id,
                   defect_part_id, defect_type_id, responsible_process_id,
                   '{local}'::timestamp AT TIME ZONE 'Europe/Istanbul',
                   '{local}'::timestamp AT TIME ZONE 'Europe/Istanbul'
            FROM issue_list WHERE id = 1""")
    print(sql(f"""
        SELECT id, to_char(issue_date AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD HH24:MI:SS.MS') || ' Istanbul',
               to_char(issue_date AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS.MS') || ' UTC', description
        FROM issue_list WHERE description LIKE '{MARK}%' ORDER BY issue_date"""))


def get(path, token):
    req = urllib.request.Request(f"{API}{path}", headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


def expected(frm, to):
    cond = ["true"]
    if frm:
        cond.append(f"(issue_date AT TIME ZONE 'Europe/Istanbul')::date >= '{frm}'")
    if to:
        cond.append(f"(issue_date AT TIME ZONE 'Europe/Istanbul')::date <= '{to}'")
    total = int(sql(f"SELECT count(*) FROM issue_list WHERE {' AND '.join(cond)}"))
    days = sql(f"""SELECT (issue_date AT TIME ZONE 'Europe/Istanbul')::date, count(*) FROM issue_list
                   WHERE {' AND '.join(cond)} GROUP BY 1 ORDER BY 1""")
    return total, {d: int(n) for d, n in (l.split("|") for l in days.splitlines() if l)}


def measure(label):
    req = urllib.request.Request(f"{API}/auth/login", data=json.dumps(
        {"email": "manager@karea.local", "password": "changeme123"}).encode(),
        headers={"Content-Type": "application/json"})
    token = json.loads(urllib.request.urlopen(req).read())["token"]
    out = []
    for name, frm, to in RANGES:
        board_q = "&".join(x for x in [frm and f"opened_from={frm}", to and f"opened_to={to}"] if x)
        ana_q = "&".join(x for x in [frm and f"from={frm}", to and f"to={to}"] if x)
        board = len(get(f"/issues?{board_q}", token)["items"])
        dash = get(f"/analysis/dashboard?{ana_q}", token)
        buckets = {d["Day"][:10]: d["CompletedCount"] for d in dash["Sparklines"]["Opened"] or []}
        want, want_days = expected(frm, to)
        out.append({"range": name, "board": board, "analysis": dash["Cards"]["OpenedIssues"],
                    "sparkline_sum": sum(buckets.values()), "buckets": buckets,
                    "expected": want, "expected_days": want_days})
    os.makedirs(STATE, exist_ok=True)
    json.dump(out, open(f"{STATE}/{label}.json", "w"), indent=1)
    print(f"== {label}")
    for r in out:
        ok = r["board"] == r["analysis"] == r["sparkline_sum"] == r["expected"]
        print(f"  {r['range']:<16} board {r['board']:>3}  analysis {r['analysis']:>3}  "
              f"daily sum {r['sparkline_sum']:>3}  sql {r['expected']:>3}  {'SAME' if ok else 'DIFFERENT'}")
        if r["buckets"] != r["expected_days"] and len(r["expected_days"]) <= 4:
            print(f"      daily buckets {r['buckets']} vs plant days {r['expected_days']}")


def report():
    before = json.load(open(f"{STATE}/before.json"))
    after = json.load(open(f"{STATE}/after.json"))
    print(f"{'range':<16} | {'sql':>3} | before: board analysis daily | after: board analysis daily")
    failed = False
    for b, a in zip(before, after):
        ok = a["board"] == a["analysis"] == a["sparkline_sum"] == a["expected"] and a["buckets"] == a["expected_days"]
        failed |= not ok
        print(f"{b['range']:<16} | {a['expected']:>3} | {b['board']:>13} {b['analysis']:>8} {b['sparkline_sum']:>5} |"
              f" {a['board']:>12} {a['analysis']:>8} {a['sparkline_sum']:>5}  {'SAME' if ok else 'DIFFERENT'}")
    print("\nafter: every range SAME on board, analysis, daily buckets and SQL" if not failed else "\nFAILED")
    sys.exit(1 if failed else 0)


def cleanup():
    n = sql(f"WITH d AS (DELETE FROM issue_list WHERE description LIKE '{MARK}%' RETURNING id) SELECT count(*) FROM d")
    print(f"deleted {n} {MARK} issues; left:", sql(f"SELECT count(*) FROM issue_list WHERE description LIKE '{MARK}%'"))


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "measure":
        measure(sys.argv[2])
    else:
        {"fixtures": fixtures, "report": report, "cleanup": cleanup}[cmd]()
