#!/usr/bin/env python3
"""EXPLAIN for the issue list opening-date filter (docs/16 A57).

The SQL is read from backend/internal/repository/postgres/issue_repo.go
(issueColumns + issueFrom) and the WHERE / ORDER BY / LIMIT are built the way
listIssues builds them, so the plans are for the query the API sends.

  python3 explain.py live   read-only, karea_ro on the live database
  python3 explain.py volume karea_eolnote_test: inside one transaction insert
                            300 000 synthetic issues over three years, ANALYZE,
                            EXPLAIN (ANALYZE, BUFFERS), then ROLLBACK

Day bounds are Europe/Istanbul midnights (domain.PlantDayStart/End).
"""
import re
import subprocess
import sys

PSQL = "/opt/homebrew/opt/libpq/bin/psql"
ROOT = "/Users/Basri/Desktop/kts_kms_project"
LIVE = "postgres://karea_ro@localhost:5432/karea?sslmode=disable"
TEST = "postgres://karea:karea_secret@localhost:5432/karea_eolnote_test?sslmode=disable"

src = open(f"{ROOT}/backend/internal/repository/postgres/issue_repo.go", encoding="utf-8").read()
COLUMNS = re.search(r"const issueColumns = `(.*?)`", src, re.S).group(1)
FROM = re.search(r"const issueFrom = `(.*?)`", src, re.S).group(1)
assert "i.issue_date >= $" in src and "i.issue_date < $" in src, "repo no longer filters issue_date"


def query(status, opened_from, opened_until, limit, before=None):
    where = [f"({status} IS NULL OR i.status = ANY({status}))"]
    if opened_from:
        where.append(f"i.issue_date >= '{opened_from}'::timestamptz")
    if opened_until:
        where.append(f"i.issue_date < '{opened_until}'::timestamptz")
    if before:
        where.append(f"(i.issue_date, i.id) < ('{before[0]}'::timestamptz, {before[1]}::bigint)")
    sql = f"SELECT {COLUMNS} {FROM} WHERE {' AND '.join(where)} ORDER BY i.issue_date DESC, i.id DESC"
    if limit:
        sql += f" LIMIT {limit}"
    return sql


NO_STATUS = "NULL::issue_status_enum[]"
OPEN_STATUS = "ARRAY['OPEN','IN_PROGRESS']::issue_status_enum[]"


def cases(today, week_from, month_from, day_after_today, old_day_end):
    return [
        ("Bugün, ilk sayfa (limit 51)", query(NO_STATUS, today, day_after_today, 51)),
        ("Son 7 gün, ilk sayfa", query(NO_STATUS, week_from, day_after_today, 51)),
        ("Son 7 gün + durum OPEN,IN_PROGRESS, ilk sayfa", query(OPEN_STATUS, week_from, day_after_today, 51)),
        ("Bu ay, dışa aktarma / toplam (limit yok)", query(NO_STATUS, month_from, day_after_today, None)),
        ("Yalnız başlangıç (Son 7 gün başı), ilk sayfa", query(NO_STATUS, week_from, None, 51)),
        ("Yalnız bitiş (eski bir gün), ilk sayfa", query(NO_STATUS, None, old_day_end, 51)),
    ]


def run(url, sql, check=True):
    out = subprocess.run([PSQL, url, "-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", sql],
                         capture_output=True, text=True)
    if check and out.returncode != 0:
        sys.exit(out.stderr)
    return out.stdout.strip()


def plant_bounds(url, now_sql):
    row = run(url, f"""
        WITH n AS (SELECT ({now_sql}) AT TIME ZONE 'Europe/Istanbul' AS l)
        SELECT (date_trunc('day', l) AT TIME ZONE 'Europe/Istanbul'),
               (date_trunc('day', l) - interval '6 days') AT TIME ZONE 'Europe/Istanbul',
               date_trunc('month', l) AT TIME ZONE 'Europe/Istanbul',
               (date_trunc('day', l) + interval '1 day') AT TIME ZONE 'Europe/Istanbul',
               (date_trunc('day', l) - interval '400 days') AT TIME ZONE 'Europe/Istanbul'
        FROM n""")
    return row.split("|")


def explain_block(title, sql):
    return f"\\echo '== {title}'\nEXPLAIN (ANALYZE, BUFFERS, COSTS, TIMING OFF, SUMMARY ON) {sql};\n"


def live():
    print("== live (karea_ro, read-only)")
    print("issues:", run(LIVE, "SELECT count(*) FROM issue_list"))
    b = plant_bounds(LIVE, "SELECT max(issue_date) FROM issue_list")
    print("bounds (latest issue's plant day):", " | ".join(b))
    script = "".join(explain_block(t, s) for t, s in cases(*b))
    out = subprocess.run([PSQL, LIVE, "-X", "-v", "ON_ERROR_STOP=1", "-c", "SET default_transaction_read_only = on"]
                         + ["-f", "-"], input=script, capture_output=True, text=True)
    print(out.stdout, out.stderr)
    sys.exit(out.returncode)


def volume():
    assert TEST.split("?")[0].endswith("_test")
    b = plant_bounds(TEST, "SELECT now()")
    print("== volume (karea_eolnote_test, rolled back)")
    print("bounds (today, plant day):", " | ".join(b))
    script = (
        "\\set ON_ERROR_STOP on\nBEGIN;\n"
        "INSERT INTO issue_list (vin, source_type, source_station_step_id, source_check_item_id, station_id,\n"
        "  issue_type_id, severity, description, status, issue_reporter_id, defect_part_id, defect_type_id,\n"
        "  responsible_process_id, issue_date)\n"
        "SELECT s.vin, s.source_type, s.source_station_step_id, s.source_check_item_id, s.station_id,\n"
        "  s.issue_type_id, s.severity, 'tmp-explain-volume', (ARRAY['OPEN','IN_PROGRESS','DONE','APPROVED','APPROVED','APPROVED'])[1 + g % 6]::issue_status_enum,\n"
        "  s.issue_reporter_id, s.defect_part_id, s.defect_type_id, s.responsible_process_id,\n"
        "  now() - (g * interval '315 seconds')\n"
        "FROM generate_series(1, 300000) g,\n"
        "     (SELECT * FROM issue_list WHERE status = 'OPEN' ORDER BY id LIMIT 1) s;\n"
        "ANALYZE issue_list;\n"
        "SELECT 'issues after insert: ' || count(*) FROM issue_list;\n"
        + "".join(explain_block(t, s) for t, s in cases(*b))
        + "ROLLBACK;\nSELECT 'issues after rollback: ' || count(*) FROM issue_list;\n"
    )
    out = subprocess.run([PSQL, TEST, "-X", "-f", "-"], input=script, capture_output=True, text=True)
    print(out.stdout, out.stderr)
    sys.exit(out.returncode)


if __name__ == "__main__":
    {"live": live, "volume": volume}[sys.argv[1] if len(sys.argv) > 1 else ""]()
