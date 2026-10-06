#!/usr/bin/env python3
"""Vehicle gallery without EoL item photos (docs/16 A45). Test database only.

  python3 run-gallery-verification.py seed     on the test API (18081): create a
                                               TEMP manual issue for the VIN and
                                               upload ISSUE, ISSUE_RESOLUTION and
                                               VEHICLE photos through POST /media
  python3 run-gallery-verification.py count L  GET /vehicles/{vin}/media and print
                                               the rows per entity_type, labelled L
                                               (run once before and once after the
                                               ListByVIN filter)

The live database and the API on 8080 are never used.
"""
import json
import subprocess
import sys
import urllib.request
import uuid

PSQL = "/opt/homebrew/opt/libpq/bin/psql"
URL = "postgres://karea:karea_secret@localhost:5432/karea_eolnote_test?sslmode=disable"
API = "http://localhost:18081/api/v1"
VIN = "N7V1K1SA0TK000003"
JPEG = "/tmp/eol-photo-1.jpg"


def psql(sql):
    r = subprocess.run([PSQL, URL, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-At", "-F", "|", "-c", sql],
                       capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit(r.stderr.strip())
    return r.stdout.strip()


def login():
    req = urllib.request.Request(API + "/auth/login", data=json.dumps(
        {"email": "manager@karea.local", "password": "changeme123"}).encode(), method="POST")
    req.add_header("Content-Type", "application/json")
    return json.loads(urllib.request.urlopen(req).read())["token"]


def call(method, path, token, body=None, raw=None, ctype="application/json"):
    req = urllib.request.Request(API + path, data=raw if raw is not None else
                                 (json.dumps(body).encode() if body is not None else None), method=method)
    req.add_header("Content-Type", ctype)
    req.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        raise SystemExit(f"{method} {path} -> {e.code} {e.read().decode()}")


def upload(token, entity_type, entity_id, name):
    boundary = uuid.uuid4().hex
    data = open(JPEG, "rb").read()
    body = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"entity_type\"\r\n\r\n{entity_type}\r\n"
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"entity_id\"\r\n\r\n{entity_id}\r\n"
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{name}\"\r\n"
            f"Content-Type: image/jpeg\r\n\r\n").encode() + data + f"\r\n--{boundary}--\r\n".encode()
    return call("POST", "/media", token, raw=body, ctype=f"multipart/form-data; boundary={boundary}")


def phase_seed():
    token = login()
    st, issue = call("POST", "/issues", token, {
        "vin": VIN, "source_type": "MANUAL", "severity": "LOW", "station_id": 8, "issue_type_id": 1,
        "description": "TEMP-GALLERY galeri doğrulama arızası",
        "defect_part_id": 1, "defect_type_id": 1,
        "custom_part_name": "TEMP-GALLERY parça", "custom_defect_name": "TEMP-GALLERY kusur",
    })
    iid = issue.get("ID") or issue.get("id")
    print(f"POST /issues -> {st}, issue id {iid}")
    for et, eid, name in [("ISSUE", iid, "gallery-issue-1.jpg"), ("ISSUE", iid, "gallery-issue-2.jpg"),
                          ("ISSUE_RESOLUTION", iid, "gallery-resolution-1.jpg"),
                          ("VEHICLE", VIN, "gallery-vehicle-1.jpg")]:
        st, m = upload(token, et, eid, name)
        print(f"POST /media {et}/{eid} {name} -> {st}, media id {m['id']}")


def phase_count(label):
    token = login()
    st, res = call("GET", f"/vehicles/{VIN}/media", token)
    items = res["items"]
    by_type = {}
    for m in items:
        by_type[m["entity_type"]] = by_type.get(m["entity_type"], 0) + 1
    db = psql(f"SELECT entity_type || '=' || count(*) FROM media_attachments WHERE vin = '{VIN}' "
              f"GROUP BY entity_type ORDER BY entity_type").replace("\n", ", ")
    print(f"[{label}] GET /vehicles/{VIN}/media -> {st}: {len(items)} rows; "
          + ", ".join(f"{k}={v}" for k, v in sorted(by_type.items())))
    print(f"[{label}] media_attachments rows for the VIN in the DB: {db}")
    for m in items:
        print(f"[{label}]   id={m['id']} {m['entity_type']}/{m['entity_id']} {m['file_name']}")


if __name__ == "__main__":
    if sys.argv[1:2] == ["seed"]:
        phase_seed()
    elif sys.argv[1:2] == ["count"]:
        phase_count(sys.argv[2])
    else:
        raise SystemExit(__doc__)
