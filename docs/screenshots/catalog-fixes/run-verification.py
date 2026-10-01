"""Verification for the catalogue fixes (inactive zone / part / type / process).

Runs against a throwaway *_test database that was built from migrations
0001-0032 plus the pre-0033 defect catalogue seed (so 99-99 starts under
Body, exactly like production), with the API under test on port 18081.
The script applies migration 0033 itself to show its effect on existing
"Diğer" issues.

Usage:
  python3 run-verification.py > verification-output.txt

Refuses to run against port 8080 or a database whose name does not end in _test.
"""
import json
import subprocess
import sys
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:18081/api/v1"
DB = "postgres://karea:karea_secret@localhost:5432/karea_catalog_test"
PSQL = "/opt/homebrew/opt/libpq/bin/psql"
MIGRATIONS = "/Users/Basri/Desktop/kts_kms_project/database/migrations"

assert ":8080" not in BASE, "never touch the live API"
assert DB.rsplit("/", 1)[1].endswith("_test"), "database must be *_test"

TOKEN = None
VIN = "N7V1K1SA0TK000003"  # IN_PRODUCTION fixture vehicle in the test DB
STATION = 2
TAG = "catalog-fix-test"
FAILS = []


def call(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if TOKEN:
        req.add_header("Authorization", "Bearer " + TOKEN)
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read().decode()
            return r.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw)
        except ValueError:
            return e.code, raw


def sql(q):
    out = subprocess.run([PSQL, DB, "-At", "-F", " | ", "-c", q], capture_output=True, text=True, check=True)
    return out.stdout.strip()


def sql_file(path):
    out = subprocess.run([PSQL, DB, "-q", "-v", "ON_ERROR_STOP=1", "-f", path],
                         capture_output=True, text=True, check=True)
    return out.stdout.strip()


def head(title):
    print()
    print("=" * 72)
    print(title)
    print("=" * 72)


def check(label, ok, detail=""):
    print(f"  [{'OK' if ok else 'FAIL'}] {label}" + (f" -> {detail}" if detail != "" else ""))
    if not ok:
        FAILS.append(label)


def err(body):
    return body.get("error") if isinstance(body, dict) else body


def ids(path):
    return {x["ID"] for x in call("GET", path)[1]["items"]}


def by_code(path):
    return {x["Code"]: x for x in call("GET", path)[1]["items"]}


def create_issue(part_id, type_id, desc, custom_part="", custom_defect=""):
    return call("POST", "/issues", {
        "vin": VIN, "source_type": "MANUAL", "station_id": STATION, "issue_type_id": 1,
        "severity": "MEDIUM", "description": f"{TAG}: {desc}",
        "defect_part_id": part_id, "defect_type_id": type_id,
        "custom_part_name": custom_part, "custom_defect_name": custom_defect,
    })


def issue_row(iid):
    return sql(f"select defect_part_id, defect_type_id, responsible_process_id, defect_code, "
               f"coalesce(defect_part_name_tr,'<NULL>'), coalesce(defect_type_name_tr,'<NULL>'), "
               f"coalesce(custom_part_name,'') from issue_list where id={iid}")


def set_active(kind, row, active, **extra):
    body = {"code": row["Code"], "name_tr": row["NameTR"], "name_en": row["NameEN"],
            "sort_order": row["SortOrder"], "is_active": active}
    if kind == "defect-parts":
        body["zone_id"] = row["ZoneID"]
    if kind == "defect-types":
        body["default_process_id"] = row.get("DefaultProcessID")
    body.update(extra)
    return call("PATCH", f"/{kind}/{row['ID']}", body)


def main():
    global TOKEN
    print("database:", sql("select current_database()"))
    s, b = call("POST", "/auth/login", {"email": "manager@karea.local", "password": "changeme123"})
    assert s == 200, (s, b)
    TOKEN = b.get("token") or b.get("Token") or b.get("access_token")
    print("login (test DB seed user manager@karea.local): HTTP", s)

    zones = by_code("/defect-zones")
    parts = by_code("/defect-parts")
    types = by_code("/defect-types")
    procs = by_code("/defect-processes")
    body_zone, chassis = zones["10"], zones["20"]
    other_part, other_type = parts["99-99"], types["99"]

    # ------------------------------------------------------------------
    head("0. Migration 0033 öncesi: mevcut issue'lar (canlıyla aynı durum)")
    print("  99-99 zone before 0033:", sql("select z.code, z.name_tr from defect_parts p join defect_zones z "
                                          "on z.id=p.zone_id where p.code='99-99'"))
    s, b = create_issue(other_part["ID"], types["01"]["ID"], "Diğer issue before 0033", custom_part="Serbest parça")
    check("create Diğer (99-99) issue before 0033", s == 201, f"HTTP {s} {b.get('DefectCode') if s == 201 else err(b)}")
    I_OTHER = b["ID"]
    s, b = create_issue(parts["10-01"]["ID"], types["05"]["ID"], "Body part, type 05 (default ASSEMBLY)")
    check("create 10-01 issue (process from type 05 default)", s == 201, f"HTTP {s}")
    I_BODY = b["ID"]
    s, b = create_issue(parts["20-01"]["ID"], types["02"]["ID"], "Chassis part to be deactivated")
    check("create 20-01 issue", s == 201, f"HTTP {s}")
    I_PART = b["ID"]
    before_other = issue_row(I_OTHER)
    print("  Diğer issue row before:", before_other)

    head("0b. Migration 0033 uygulanır (iki kez: idempotent)")
    sql_file(f"{MIGRATIONS}/0033_other_part_own_zone.up.sql")
    sql_file(f"{MIGRATIONS}/0033_other_part_own_zone.up.sql")
    print("  zone 99:", sql("select code, name_tr, name_en, is_active from defect_zones where code='99'"))
    check("99-99 now under zone 99",
          sql("select z.code from defect_parts p join defect_zones z on z.id=p.zone_id where p.code='99-99'") == "99")
    check("99-99 part id unchanged", sql("select id from defect_parts where code='99-99'") == str(other_part["ID"]))
    after_other = issue_row(I_OTHER)
    check("Diğer issue row unchanged (part, type, code, snapshot, custom name)", after_other == before_other,
          after_other)
    s, b = call("GET", f"/issues/{I_OTHER}")
    check("Diğer issue detail shows zone 'Diğer'", b.get("DefectZoneNameTR") == "Diğer",
          {k: b.get(k) for k in ("DefectCode", "DefectZoneNameTR", "DefectPartNameTR", "CustomPartName")})
    print("  zone count after 0033 (twice):", sql("select count(*) from defect_zones where code='99'"))

    head("0c. 0033 down + up turu")
    sql_file(f"{MIGRATIONS}/0033_other_part_own_zone.down.sql")
    print("  after down: 99-99 zone =", sql("select z.code from defect_parts p join defect_zones z on "
                                           "z.id=p.zone_id where p.code='99-99'"),
          "| zone 99 rows =", sql("select count(*) from defect_zones where code='99'"))
    sql_file(f"{MIGRATIONS}/0033_other_part_own_zone.up.sql")
    print("  after up again: 99-99 zone =", sql("select z.code from defect_parts p join defect_zones z on "
                                               "z.id=p.zone_id where p.code='99-99'"))
    check("Diğer issue row still unchanged after down/up", issue_row(I_OTHER) == before_other)
    zones = by_code("/defect-zones")
    parts = by_code("/defect-parts")
    other_zone = zones["99"]

    # ------------------------------------------------------------------
    head("1. Bölge pasife alınınca parçaları kapanır (Body)")
    body_part_ids = {p["ID"] for p in parts.values() if p["ZoneID"] == body_zone["ID"]}
    s, b = set_active("defect-zones", body_zone, False)
    check("deactivate zone Body", s == 200, f"HTTP {s}")
    active_parts = call("GET", "/defect-catalog/parts")[1]["items"]
    leaked = [p["Code"] for p in active_parts if p["ZoneID"] == body_zone["ID"]]
    check(f"active part list has no Body parts ({len(body_part_ids)} Body parts)", not leaked, leaked)
    # Search on web/mobile runs over this same active list (plus a client-side
    # zone guard), so "not in search results" == not in this list.
    hits = [p["Code"] for p in active_parts if "kapı" in (p["NameTR"] + p["NameEN"]).lower()
            or "door" in (p["NameTR"] + p["NameEN"]).lower()]
    check("search 'kapı/door' over active list finds nothing from Body", not hits, hits)
    s, b = call("GET", f"/defect-catalog/parts?zone_id={body_zone['ID']}")
    check("active parts filtered by zone=Body is empty", s == 200 and b["items"] == [], len(b["items"]))
    s, b = create_issue(parts["10-01"]["ID"], types["01"]["ID"], "new issue on Body part (zone inactive)")
    check("issue creation with Body part rejected", s == 400, f"HTTP {s} {err(b)}")
    s, b = call("POST", "/defect-parts", {"zone_id": body_zone["ID"], "code": "10-90",
                                         "name_tr": f"{TAG} pasif bölgeye", "name_en": "into inactive zone"})
    check("new part under inactive zone rejected", s == 400, f"HTTP {s} {err(b)}")
    p2001 = parts["20-02"]
    s, b = call("PATCH", f"/defect-parts/{p2001['ID']}", {"zone_id": body_zone["ID"], "code": p2001["Code"],
                                                         "name_tr": p2001["NameTR"], "name_en": p2001["NameEN"],
                                                         "sort_order": p2001["SortOrder"], "is_active": True})
    check("moving a part into inactive zone rejected", s == 400, f"HTTP {s} {err(b)}")
    check("20-02 still in Chassis", sql(f"select zone_id from defect_parts where id={p2001['ID']}")
          == str(chassis["ID"]))
    s, b = call("GET", "/defect-catalog/parts?include_inactive=1")
    flagged = {p["Code"]: p["ZoneIsActive"] for p in b["items"] if p["ZoneID"] == body_zone["ID"]}
    check("include_inactive=1 returns Body parts with ZoneIsActive=false",
          flagged and not any(flagged.values()), f"{len(flagged)} parts")
    s, b = call("GET", "/defect-catalog/zones?include_inactive=1")
    check("include_inactive=1 zones include Body (IsActive=false)",
          any(z["ID"] == body_zone["ID"] and z["IsActive"] is False for z in b["items"]))

    head("1b. 'Diğer' bölge pasifliğinden etkilenmez ve korumalı")
    check("99-99 still in active part list", other_part["ID"] in ids("/defect-catalog/parts"))
    s, b = create_issue(other_part["ID"], types["01"]["ID"], "Diğer while Body inactive", custom_part="Serbest 2")
    check("Diğer issue creation while Body inactive", s == 201, f"HTTP {s} {b.get('DefectCode') if s == 201 else err(b)}")
    I_OTHER2 = b.get("ID")
    s, b = set_active("defect-zones", other_zone, False)
    check("deactivate zone 99 rejected", s == 400, f"HTTP {s} {err(b)}")
    s, b = call("DELETE", f"/defect-zones/{other_zone['ID']}")
    check("delete zone 99 rejected", s == 400, f"HTTP {s} {err(b)}")
    s, b = set_active("defect-parts", parts["99-99"], False)
    check("deactivate part 99-99 rejected", s == 400, f"HTTP {s} {err(b)}")
    s, b = set_active("defect-parts", parts["99-99"], True, zone_id=chassis["ID"])
    check("move part 99-99 to Chassis rejected", s == 400, f"HTTP {s} {err(b)}")
    s, b = call("DELETE", f"/defect-parts/{other_part['ID']}")
    check("delete part 99-99 rejected", s == 400, f"HTTP {s} {err(b)}")
    s, b = set_active("defect-types", other_type, False)
    check("deactivate type 99 rejected", s == 400, f"HTTP {s} {err(b)}")
    s, b = call("POST", "/defect-parts", {"zone_id": other_zone["ID"], "code": "99-98",
                                         "name_tr": f"{TAG} diğer bölgeye", "name_en": "x"})
    check("new regular part in zone 99 rejected", s == 400, f"HTTP {s} {err(b)}")
    s, b = set_active("defect-zones", other_zone, True, name_tr="Diğer (yeni ad)")
    check("rename zone 99 allowed", s == 200, f"HTTP {s}")
    set_active("defect-zones", other_zone, True)

    head("1c. Pasif bölgedeki parçayı taşıyan eski issue düzenlenebilir")
    before = issue_row(I_BODY)
    s, b = call("PATCH", f"/issues/{I_BODY}/classification",
                {"defect_part_id": parts["10-01"]["ID"], "defect_type_id": types["02"]["ID"]})
    check("type-only edit on issue whose part's zone is inactive", s == 200, f"HTTP {s} {err(b) if s != 200 else ''}")
    after = issue_row(I_BODY)
    print("  before:", before)
    print("  after: ", after)
    check("part kept, part snapshot kept", after.split(" | ")[0] == before.split(" | ")[0]
          and after.split(" | ")[4] == before.split(" | ")[4])
    s, b = call("PATCH", f"/issues/{I_BODY}/classification",
                {"defect_part_id": parts["10-02"]["ID"], "defect_type_id": types["02"]["ID"]})
    check("switching to another part of the inactive zone rejected", s == 400, f"HTTP {s} {err(b)}")
    s, b = set_active("defect-zones", body_zone, True)
    check("reactivate zone Body", s == 200 and body_part_ids <= ids("/defect-catalog/parts"),
          "all Body parts back in active list")

    # ------------------------------------------------------------------
    head("2. Pasif süreç düzenlemeyi kilitlemez")
    asm = procs["ASSEMBLY"]
    print("  issue", I_BODY, "process before:", sql(f"select p.code from issue_list i join defect_processes p "
                                                    f"on p.id=i.responsible_process_id where i.id={I_BODY}"))
    # Reset to type 05 so the stored process is ASSEMBLY again.
    s, b = call("PATCH", f"/issues/{I_BODY}/classification",
                {"defect_part_id": parts["10-01"]["ID"], "defect_type_id": types["05"]["ID"]})
    check("set type 05 (default ASSEMBLY) while active", s == 200 and b.get("ResponsibleProcessID") == asm["ID"],
          b.get("ResponsibleProcessID"))
    s, b = set_active("defect-processes", asm, False)
    check("deactivate process ASSEMBLY", s == 200, f"HTTP {s}")
    s, b = call("PATCH", f"/issues/{I_BODY}/classification",
                {"defect_part_id": parts["10-03"]["ID"], "defect_type_id": types["05"]["ID"]})
    check("part change, process omitted (new editors) -> succeeds", s == 200, f"HTTP {s} {err(b) if s != 200 else ''}")
    check("process preserved (ASSEMBLY)", sql(f"select responsible_process_id from issue_list where id={I_BODY}")
          == str(asm["ID"]))
    s, b = call("PATCH", f"/issues/{I_BODY}/classification",
                {"defect_part_id": parts["10-01"]["ID"], "defect_type_id": types["05"]["ID"],
                 "responsible_process_id": asm["ID"]})
    check("unchanged inactive process sent back (old clients) -> succeeds", s == 200,
          f"HTTP {s} {err(b) if s != 200 else ''}")
    check("process still ASSEMBLY", sql(f"select responsible_process_id from issue_list where id={I_BODY}")
          == str(asm["ID"]))
    # A newly chosen inactive process is still refused: clear it first, then try to set it.
    call("PATCH", f"/issues/{I_BODY}/classification",
         {"defect_part_id": parts["10-01"]["ID"], "defect_type_id": types["05"]["ID"], "responsible_process_id": None})
    s, b = call("PATCH", f"/issues/{I_BODY}/classification",
                {"defect_part_id": parts["10-01"]["ID"], "defect_type_id": types["05"]["ID"],
                 "responsible_process_id": asm["ID"]})
    check("newly chosen inactive process rejected", s == 400, f"HTTP {s} {err(b)}")
    set_active("defect-processes", asm, True)

    # ------------------------------------------------------------------
    head("3. Pasif parça / tip düzenlemeyi kilitlemez")
    p_dead = parts["20-01"]
    s, b = set_active("defect-parts", p_dead, False)
    check("deactivate part 20-01", s == 200)
    s, b = set_active("defect-parts", p_dead, False, name_tr="YENİ AD (pasif)", name_en="NEW NAME")
    check("rename inactive 20-01 -> 'YENİ AD (pasif)'", s == 200)
    before = issue_row(I_PART)
    s, b = call("PATCH", f"/issues/{I_PART}/classification",
                {"defect_part_id": p_dead["ID"], "defect_type_id": types["03"]["ID"]})
    check("issue with inactive part: type-only edit succeeds", s == 200, f"HTTP {s} {err(b) if s != 200 else ''}")
    after = issue_row(I_PART)
    print("  before:", before)
    print("  after: ", after)
    check("part id and part-name snapshot kept (not renamed to 'YENİ AD')",
          after.split(" | ")[0] == before.split(" | ")[0] and after.split(" | ")[4] == before.split(" | ")[4])
    check("defect_code updated for the new type only", after.split(" | ")[3].endswith("-03"), after.split(" | ")[3])
    s, b = call("PATCH", f"/issues/{I_BODY}/classification",
                {"defect_part_id": p_dead["ID"], "defect_type_id": types["05"]["ID"]})
    check("choosing an inactive part on another issue rejected", s == 400, f"HTTP {s} {err(b)}")
    t_dead = types["03"]
    s, b = set_active("defect-types", t_dead, False)
    check("deactivate type 03", s == 200)
    s, b = call("PATCH", f"/issues/{I_PART}/classification",
                {"defect_part_id": p_dead["ID"], "defect_type_id": t_dead["ID"]})
    check("issue with inactive part AND inactive type: re-save unchanged succeeds", s == 200,
          f"HTTP {s} {err(b) if s != 200 else ''}")
    check("row identical after unchanged re-save", issue_row(I_PART) == after, issue_row(I_PART))
    s, b = call("PATCH", f"/issues/{I_BODY}/classification",
                {"defect_part_id": parts["10-01"]["ID"], "defect_type_id": t_dead["ID"]})
    check("choosing an inactive type on another issue rejected", s == 400, f"HTTP {s} {err(b)}")

    # Legacy row without snapshots (pre-0020): an unchanged-part edit keeps NULL.
    sql(f"insert into issue_list (vin, source_type, station_id, issue_type_id, severity, description, status, "
        f"issue_reporter_id, defect_part_id, defect_type_id, defect_code) "
        f"select '{VIN}', 'MANUAL', {STATION}, 1, 'MEDIUM', '{TAG}: legacy row without snapshot', 'OPEN', "
        f"id, {p_dead['ID']}, {types['01']['ID']}, '20-01-01' from users where email='manager@karea.local'")
    I_LEGACY = int(sql(f"select max(id) from issue_list where description='{TAG}: legacy row without snapshot'"))
    s, b = call("PATCH", f"/issues/{I_LEGACY}/classification",
                {"defect_part_id": p_dead["ID"], "defect_type_id": types["02"]["ID"]})
    check("legacy row (inactive part, NULL snapshot): type-only edit succeeds", s == 200, f"HTTP {s}")
    print("  legacy row after:", issue_row(I_LEGACY))
    check("legacy part snapshot still NULL (live name fallback unchanged)",
          issue_row(I_LEGACY).split(" | ")[4] == "<NULL>")

    # ------------------------------------------------------------------
    head("4. Filtrelerde pasif değerler (eski issue'lar süzülebilir)")
    s, b = call("GET", "/defect-catalog/parts?include_inactive=1")
    row = next((p for p in b["items"] if p["ID"] == p_dead["ID"]), None)
    check("inactive part 20-01 in filter list (include_inactive)", row is not None and row["IsActive"] is False,
          row and {k: row[k] for k in ("Code", "NameTR", "IsActive", "ZoneIsActive")})
    check("inactive part 20-01 NOT in picker list", p_dead["ID"] not in ids("/defect-catalog/parts"))
    s, b = call("GET", "/defect-catalog/types?include_inactive=1")
    check("inactive type 03 in filter list", any(t["ID"] == t_dead["ID"] and t["IsActive"] is False
                                                 for t in b["items"]))
    s, b = call("GET", f"/issues?vin={VIN}")
    items = b.get("items") if isinstance(b, dict) else b
    matched = sorted(i["ID"] for i in items if i.get("DefectPartID") == p_dead["ID"])
    check("Issues filter by inactive part 20-01 (client-side on DefectPartID) finds old issues",
          I_PART in matched and I_LEGACY in matched, matched)

    # ------------------------------------------------------------------
    head("5. Anlık görüntüler (snapshot) bozulmadı")
    s, b = call("GET", f"/issues/{I_PART}")
    check("issue detail shows snapshot part name, not the renamed live name",
          b.get("DefectPartNameTR") != "YENİ AD (pasif)", b.get("DefectPartNameTR"))
    check("Diğer issue still intact", issue_row(I_OTHER) == before_other, issue_row(I_OTHER))

    # restore catalogue state of the test DB (it is dropped afterwards anyway)
    set_active("defect-parts", p_dead, True)
    set_active("defect-types", t_dead, True)

    head("Temizlik (yalnız bu betiğin oluşturdukları; veritabanı sonra tamamen silinecek)")
    mine = [i for i in [I_OTHER, I_BODY, I_PART, I_OTHER2, I_LEGACY] if i]
    id_list = ",".join(str(i) for i in mine)
    print("  issues created:", id_list)
    print("  audit rows for them:",
          sql(f"select count(*) from audit_logs where (metadata->>'issue_id')::bigint in ({id_list})"))
    print("  catalogue rows created by this script:",
          sql(f"select count(*) from defect_parts where name_tr like '{TAG}%'"))

    print()
    print("RESULT:", "ALL CHECKS PASSED" if not FAILS else f"{len(FAILS)} FAILED: {FAILS}")
    return 1 if FAILS else 0


if __name__ == "__main__":
    sys.exit(main())
