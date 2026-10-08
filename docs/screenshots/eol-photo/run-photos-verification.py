#!/usr/bin/env python3
"""EoL item photos in the checklist list (docs/16 A44). Test database only.

  python3 run-photos-verification.py prep   on karea_eolnote_test: grow the
                                            vehicle's EoL template to 50 items
                                            (TEMP-50 rows) and turn on statement
                                            logging for this database only
  python3 run-photos-verification.py api    upload photos through POST /media on
                                            the test API (18081), read the list,
                                            count SQL statements per list call

The live database and the API on 8080 are never used.
"""
import json
import os
import subprocess
import sys
import time
import urllib.request
import uuid

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "lib"))
from output_dir import script_output_dir  # noqa: E402

PSQL = "/opt/homebrew/opt/libpq/bin/psql"
DB = "karea_eolnote_test"
URL = f"postgres://karea:karea_secret@localhost:5432/{DB}?sslmode=disable"
API = "http://localhost:18081/api/v1"
VIN = "N7V1K1SA0TK000003"
JPEG = "/tmp/eol-photo-{}.jpg"
failures = []


def psql(sql):
    r = subprocess.run([PSQL, URL, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-At", "-F", "|", "-c", sql],
                       capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit(r.stderr.strip())
    return r.stdout.strip()


def check(label, ok, detail=""):
    print(f"  [{'PASS' if ok else 'FAIL'}] {label}" + (f" — {detail}" if detail else ""))
    if not ok:
        failures.append(label)


def template_id():
    return int(psql(f"SELECT DISTINCT cti.template_id FROM checklist_item_progress p "
                    f"JOIN checklist_template_items cti ON cti.id = p.check_item_id "
                    f"WHERE p.vin = '{VIN}' AND p.checklist_type = 'EOL'"))


def phase_prep():
    tid = template_id()
    have = int(psql(f"SELECT count(*) FROM checklist_template_items WHERE template_id = {tid} AND is_active"))
    psql(f"INSERT INTO checklist_template_items (template_id, item_no, item_text, eol_phase, is_active) "
         f"SELECT {tid}, (SELECT max(item_no) FROM checklist_template_items WHERE template_id = {tid}) + g, "
         f"'TEMP-50 madde ' || g || ': Kapı contası tam oturmuş, yırtık ve açıklık yok', 'BRANCH', TRUE "
         f"FROM generate_series(1, {50 - have}) g")
    print(f"template {tid}: {have} active items + {50 - have} TEMP-50 items = "
          + psql(f"SELECT count(*) FROM checklist_template_items WHERE template_id = {tid} AND is_active"))
    psql(f"ALTER DATABASE {DB} SET log_statement = 'all'")
    print(f"log_statement=all set on {DB} only (new sessions)")


def call(method, path, token, body=None, raw=None, ctype="application/json"):
    req = urllib.request.Request(API + path, data=raw if raw is not None else
                                 (json.dumps(body).encode() if body is not None else None), method=method)
    req.add_header("Content-Type", ctype)
    req.add_header("Authorization", "Bearer " + token)
    with urllib.request.urlopen(req) as r:
        return r.status, json.loads(r.read() or b"null")


def upload(token, progress_id, name, path):
    boundary = uuid.uuid4().hex
    data = open(path, "rb").read()
    body = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"entity_type\"\r\n\r\nCHECKLIST_ITEM_PROGRESS\r\n"
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"entity_id\"\r\n\r\n{progress_id}\r\n"
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{name}\"\r\n"
            f"Content-Type: image/jpeg\r\n\r\n").encode() + data + f"\r\n--{boundary}--\r\n".encode()
    return call("POST", "/media", token, raw=body, ctype=f"multipart/form-data; boundary={boundary}")


def docker_log_since(ts):
    r = subprocess.run(["docker", "logs", "--since", ts, "karea_postgres"], capture_output=True, text=True)
    return (r.stdout + r.stderr).splitlines()


def phase_api():
    req = urllib.request.Request(API + "/auth/login", data=json.dumps(
        {"email": "manager@karea.local", "password": "changeme123"}).encode(), method="POST")
    req.add_header("Content-Type", "application/json")
    token = json.loads(urllib.request.urlopen(req).read())["token"]

    # Re-runs start clean: drop only this script's own uploads (test DB).
    psql(f"DELETE FROM media_attachments WHERE vin = '{VIN}' AND file_name LIKE 'madde%.jpg'")
    issues_before = psql("SELECT count(*) FROM issue_list")
    pids = dict(tuple(r.split("|")) for r in psql(
        f"SELECT cti.item_no, p.id FROM checklist_item_progress p JOIN checklist_template_items cti "
        f"ON cti.id = p.check_item_id WHERE p.vin = '{VIN}' AND p.checklist_type = 'EOL' "
        f"AND cti.item_no IN (1, 2) ORDER BY 1").splitlines())
    print(f"progress ids: item 1 -> {pids['1']}, item 2 -> {pids['2']}")

    print("\n== 1. Upload through POST /media (CHECKLIST_ITEM_PROGRESS) ==")
    for i, name in enumerate(["madde1-a.jpg", "madde1-b.jpg", "madde1-c.jpg"]):
        st, m = upload(token, pids["1"], name, JPEG.format(i % 2))
        check(f"upload {name} to progress {pids['1']}", st == 201, f"HTTP {st} id={m['id']} vin={m['vin']} size={m['file_size']}")
        time.sleep(0.05)
    st, m = upload(token, pids["2"], "madde2-a.jpg", JPEG.format(0))
    check(f"upload madde2-a.jpg to progress {pids['2']}", st == 201, f"HTTP {st} id={m['id']}")
    check("issue_list unchanged by uploads", psql("SELECT count(*) FROM issue_list") == issues_before,
          f"before={issues_before} after={psql('SELECT count(*) FROM issue_list')}")

    print("\n== 2. List returns every photo ==")
    ts = time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(time.time() - 1))
    psql("SELECT 'KAREA_MARK_BEGIN'")
    st, res = call("GET", f"/vehicles/{VIN}/checklist/eol", token)
    psql("SELECT 'KAREA_MARK_END'")
    items = res["items"]
    by_no = {it["ItemNo"]: it for it in items}
    p1 = [p["file_name"] for p in by_no[1]["Photos"]]
    p2 = [p["file_name"] for p in by_no[2]["Photos"]]
    print(f"   {len(items)} items; item 1 photos {p1}; item 2 photos {p2}")
    check("list has 50 active items", sum(1 for it in items if it.get("IsActive")) == 50)
    check("item 1 returns all three photos, oldest first", p1 == ["madde1-a.jpg", "madde1-b.jpg", "madde1-c.jpg"])
    check("item 2 returns its one photo", p2 == ["madde2-a.jpg"])
    check("every other item has Photos == []",
          all(it["Photos"] == [] for it in items if it["ItemNo"] not in (1, 2)))

    print("\n== 3. SQL statements for one GET /vehicles/{vin}/checklist/eol ==")
    time.sleep(1)
    lines = docker_log_since(ts)
    begin = next(i for i, l in enumerate(lines) if "KAREA_MARK_BEGIN" in l)
    end = next(i for i, l in enumerate(lines) if "KAREA_MARK_END" in l)
    stmts = [l for l in lines[begin + 1:end] if "execute" in l or "statement:" in l]
    for s in stmts:
        print("   ", s.split("LOG:", 1)[-1].strip()[:150])
    # A logged statement spans several lines; count media reads over the block.
    block = lines[begin + 1:end]
    media_reads = sum(l.count("FROM media_attachments") for l in block)
    print(f"   total statements: {len(stmts)}; 'FROM media_attachments' occurrences: {media_reads} "
          f"(one per UNION branch of the single item-list statement)")
    check("4 statements for the whole request, independent of item/photo count", len(stmts) == 4)
    check("media read only inside the item-list statement (2 = its two UNION branches)", media_reads == 2)

    json.dump(by_no[1], open(os.path.join(script_output_dir(__file__), "api-item1.json"), "w"),
              ensure_ascii=False, indent=1, default=str)
    print("\nALL CHECKS PASSED" if not failures else f"\nFAILED: {failures}")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    {"prep": phase_prep, "api": phase_api}[sys.argv[1]]()
