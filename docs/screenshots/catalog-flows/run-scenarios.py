"""Defect catalogue management scenarios against a throwaway *_test database.

Usage (API started separately on 18081 against karea_catalog_test):
  python3 run-scenarios.py > scenarios-output.txt

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

assert ":8080" not in BASE, "never touch the live API"
assert DB.rsplit("/", 1)[1].endswith("_test"), "database must be *_test"

TOKEN = None


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


def show(label, status, body=None, keys=None):
    if isinstance(body, dict) and keys:
        body = {k: body.get(k) for k in keys}
    print(f"  {label}: HTTP {status}" + (f" {json.dumps(body, ensure_ascii=False)}" if body is not None else ""))


def head(title):
    print()
    print("=" * 72)
    print(title)
    print("=" * 72)


def active_part_ids():
    return {p["ID"] for p in call("GET", "/defect-catalog/parts")[1]["items"]}


def active_zone_ids():
    return {z["ID"] for z in call("GET", "/defect-catalog/zones")[1]["items"]}


def active_type_ids():
    return {t["ID"] for t in call("GET", "/defect-catalog/types")[1]["items"]}


def active_process_ids():
    return {p["ID"] for p in call("GET", "/defect-catalog/processes")[1]["items"]}


VIN = "N7V1K1SA0TK000003"  # IN_PRODUCTION fixture vehicle in the test DB
STATION = 2


def create_issue(part_id, type_id, desc, custom_part="", custom_defect=""):
    return call("POST", "/issues", {
        "vin": VIN, "source_type": "MANUAL", "station_id": STATION, "issue_type_id": 1,
        "severity": "MEDIUM", "description": desc,
        "defect_part_id": part_id, "defect_type_id": type_id,
        "custom_part_name": custom_part, "custom_defect_name": custom_defect,
    })


def issue_view(iid):
    s, b = call("GET", f"/issues/{iid}")
    return s, {k: b.get(k) for k in ("ID", "DefectCode", "DefectPartID", "DefectPartNameTR", "DefectZoneID",
                                      "DefectTypeID", "DefectTypeNameTR", "ResponsibleProcessID")}


def main():
    global TOKEN
    print("database:", sql("select current_database()"))
    s, b = call("POST", "/auth/login", {"email": "manager@karea.local", "password": "changeme123"})
    assert s == 200, (s, b)
    TOKEN = b.get("token") or b.get("Token") or b.get("access_token")
    print("login (test DB seed user manager@karea.local): HTTP", s)

    zones = {z["Code"]: z for z in call("GET", "/defect-zones")[1]["items"]}
    types = {t["Code"]: t for t in call("GET", "/defect-types")[1]["items"]}
    procs = {p["Code"]: p for p in call("GET", "/defect-processes")[1]["items"]}
    parts = {p["Code"]: p for p in call("GET", "/defect-parts")[1]["items"]}
    body = zones["10"]
    t_gap = types["01"]
    print("zones:", {c: z["NameTR"] for c, z in zones.items()})
    print("'Diğer' part 99-99 zone:", parts["99-99"]["ZoneCode"], parts["99-99"]["ZoneNameTR"])

    # ------------------------------------------------------------------
    head("1. Yeni parça ekleme (Body bölgesine)")
    s, p1 = call("POST", "/defect-parts", {"zone_id": body["ID"], "code": "10-10", "name_tr": "Test Kapı Kolu",
                                          "name_en": "Test Door Handle", "sort_order": 0})
    show("create 10-10 'Test Kapı Kolu'", s, p1, ["ID", "Code", "ZoneID", "SortOrder", "IsActive"])
    P1 = p1["ID"]
    print("  in active picker list:", P1 in active_part_ids())
    s, b = call("POST", "/defect-parts", {"zone_id": body["ID"], "code": "ZZZ", "name_tr": "Prefix yok",
                                         "name_en": "No prefix"})
    show("create code 'ZZZ' (no zone prefix) in Body", s, b, ["ID", "Code"])
    P_ZZZ = b.get("ID") if isinstance(b, dict) else None
    s, b = call("POST", "/defect-parts", {"zone_id": body["ID"], "code": "40-77", "name_tr": "Yanlış önek",
                                         "name_en": "Wrong prefix"})
    show("create code '40-77' (Elektrik prefix) in Body", s, b, ["ID", "Code"])
    P_WRONG = b.get("ID") if isinstance(b, dict) else None
    s, b = call("POST", "/defect-parts", {"zone_id": body["ID"], "code": "", "name_tr": "Kodsuz",
                                         "name_en": "No code"})
    show("create with empty code", s, b)

    # ------------------------------------------------------------------
    head("5. Aynı kod / aynı ad ile ikinci parça")
    s, b = call("POST", "/defect-parts", {"zone_id": body["ID"], "code": "10-10", "name_tr": "Başka ad",
                                         "name_en": "Other name"})
    show("same code 10-10", s, b)
    s, b = call("POST", "/defect-parts", {"zone_id": zones["20"]["ID"], "code": "10-10", "name_tr": "Şasi'de",
                                         "name_en": "x"})
    show("same code 10-10 in another zone", s, b)
    s, b = call("POST", "/defect-parts", {"zone_id": body["ID"], "code": "10-11", "name_tr": "Test Kapı Kolu",
                                         "name_en": "Test Door Handle"})
    show("same name 'Test Kapı Kolu', new code 10-11, same zone", s, b, ["ID", "Code", "NameTR"])
    P_DUPNAME = b.get("ID") if isinstance(b, dict) else None
    s, b = call("POST", "/defect-parts", {"zone_id": body["ID"], "code": "10-12", "name_tr": "test kapı kolu ",
                                         "name_en": "x"})
    show("same name different case + trailing space, code 10-12", s, b, ["ID", "Code", "NameTR"])
    P_DUPNAME2 = b.get("ID") if isinstance(b, dict) else None
    s, b = call("POST", "/defect-parts", {"zone_id": body["ID"], "code": " 10-10 ", "name_tr": "Boşluklu kod",
                                         "name_en": "x"})
    show("code ' 10-10 ' (spaces)", s, b)

    # ------------------------------------------------------------------
    head("2. Parçayı pasife almak")
    s, i1 = create_issue(P1, t_gap["ID"], "catalog-test issue on 10-10")
    show("issue created with 10-10 before deactivation", s, i1, ["ID", "DefectCode"])
    I1 = i1["ID"]
    s, b = call("PATCH", f"/defect-parts/{P1}", {"zone_id": body["ID"], "code": "10-10", "name_tr": "Test Kapı Kolu",
                                                "name_en": "Test Door Handle", "sort_order": 1, "is_active": False})
    show("deactivate 10-10", s, b)
    print("  in active picker list after deactivate:", P1 in active_part_ids())
    print("  issue detail after deactivate:", issue_view(I1))
    s, b = create_issue(P1, t_gap["ID"], "catalog-test new issue on inactive part")
    show("new issue with inactive part", s, b)
    s, b = call("PATCH", f"/issues/{I1}/classification", {"defect_part_id": P1, "defect_type_id": types["03"]["ID"],
                                                         "responsible_process_id": None})
    show("edit classification of old issue, keep inactive part, change type", s, b)
    # Rename while inactive: snapshot must keep the old name on I1
    s, b = call("PATCH", f"/defect-parts/{P1}", {"zone_id": body["ID"], "code": "10-10", "name_tr": "YENİ AD",
                                                "name_en": "NEW NAME", "sort_order": 1, "is_active": False})
    show("rename 10-10 -> 'YENİ AD' (still inactive)", s, b)
    print("  issue detail after rename (snapshot):", issue_view(I1))
    print("  DB row:", sql(f"select defect_part_id, defect_part_name_tr, defect_code from issue_list where id={I1}"))
    # Legacy row with no snapshot (pre-0020) falls back to the live name
    sql(f"insert into issue_list (vin, source_type, station_id, issue_type_id, severity, description, status, "
        f"issue_reporter_id, defect_part_id, defect_type_id, defect_code) "
        f"select '{VIN}', 'MANUAL', {STATION}, 1, 'MEDIUM', 'catalog-test legacy row without snapshot', 'OPEN', "
        f"id, {P1}, {t_gap['ID']}, '10-10-01' from users where email='manager@karea.local'")
    I_LEGACY = int(sql("select max(id) from issue_list where description='catalog-test legacy row without snapshot'"))
    print("  legacy (NULL snapshot) row detail:", issue_view(I_LEGACY))

    # ------------------------------------------------------------------
    head("3. Parçayı silmek")
    s, b = call("DELETE", f"/defect-parts/{P1}")
    show("delete 10-10 (used by 2 issues)", s, b)
    s, b = call("DELETE", f"/defect-parts/{P_ZZZ}")
    show("delete ZZZ (never used)", s, b)
    print("  ZZZ still in DB:", sql(f"select count(*) from defect_parts where id={P_ZZZ}"))
    s, b = call("DELETE", "/defect-parts/999999")
    show("delete non-existent id", s, b)

    # ------------------------------------------------------------------
    head("4. Pasif parçayı tekrar aktif etmek")
    s, b = call("PATCH", f"/defect-parts/{P1}", {"zone_id": body["ID"], "code": "10-10", "name_tr": "YENİ AD",
                                                "name_en": "NEW NAME", "sort_order": 1, "is_active": True})
    show("reactivate 10-10", s, b)
    print("  in active picker list:", P1 in active_part_ids())
    s, b = create_issue(P1, t_gap["ID"], "catalog-test issue after reactivation")
    show("new issue with reactivated part", s, b, ["ID", "DefectCode", "DefectPartNameTR"])
    I_REACT = b.get("ID")
    print("  old issue still shows its snapshot:", issue_view(I1))

    # ------------------------------------------------------------------
    head("6. Bölgeyi pasife almak (Body)")
    body_active_parts = [p for p in call("GET", "/defect-parts")[1]["items"]
                         if p["ZoneID"] == body["ID"] and p["IsActive"]]
    s, b = call("PATCH", f"/defect-zones/{body['ID']}", {"code": body["Code"], "name_tr": body["NameTR"],
                                                         "name_en": body["NameEN"], "sort_order": body["SortOrder"],
                                                         "is_active": False})
    show("deactivate zone Body", s, b)
    print("  Body in active zone list:", body["ID"] in active_zone_ids())
    still = [p["Code"] for p in call("GET", "/defect-catalog/parts")[1]["items"] if p["ZoneID"] == body["ID"]]
    print(f"  Body parts still returned by active-parts picker endpoint: {len(still)} of "
          f"{len(body_active_parts)} -> {still}")
    door = parts["10-01"]
    s, b = create_issue(door["ID"], t_gap["ID"], "catalog-test issue on part under inactive zone")
    show("new issue with 10-01 Kapı (zone Body inactive)", s, b, ["ID", "DefectCode"])
    I_ZONE = b.get("ID")
    s, b = create_issue(parts["99-99"]["ID"], t_gap["ID"], "catalog-test Diğer under inactive zone",
                        custom_part="Test serbest metin")
    show("new issue with 99-99 Diğer (also lives in Body)", s, b, ["ID", "DefectCode"])
    I_OTHER = b.get("ID")
    s, b = call("POST", "/defect-parts", {"zone_id": body["ID"], "code": "10-13", "name_tr": "Pasif bölgeye",
                                         "name_en": "Into inactive zone"})
    show("create new part under inactive zone", s, b, ["ID", "Code", "IsActive"])
    P_INZONE = b.get("ID") if isinstance(b, dict) else None
    s, b = call("DELETE", f"/defect-zones/{body['ID']}")
    show("delete zone Body", s, b)
    s, b = call("PATCH", f"/defect-zones/{body['ID']}", {"code": body["Code"], "name_tr": body["NameTR"],
                                                         "name_en": body["NameEN"], "sort_order": body["SortOrder"],
                                                         "is_active": True})
    show("reactivate zone Body", s, b)

    # ------------------------------------------------------------------
    head("7. Kusur tipleri")
    s, ty = call("POST", "/defect-types", {"code": "50", "name_tr": "Test kusur", "name_en": "Test defect",
                                          "default_process_id": None})
    show("create type 50", s, ty, ["ID", "Code", "DefaultProcessID"])
    T1 = ty["ID"]
    s, b = call("POST", "/defect-types", {"code": "50", "name_tr": "x", "name_en": "x"})
    show("same type code 50", s, b)
    s, b = call("POST", "/defect-types", {"code": "51", "name_tr": "Test kusur", "name_en": "Test defect"})
    show("same type name, code 51", s, b, ["ID", "Code", "NameTR"])
    T_DUP = b.get("ID") if isinstance(b, dict) else None
    s, b = create_issue(door["ID"], T1, "catalog-test issue on type 50")
    show("issue with type 50", s, b, ["ID", "DefectCode"])
    I_T = b.get("ID")
    s, b = call("PATCH", f"/defect-types/{T1}", {"code": "50", "name_tr": "Test kusur", "name_en": "Test defect",
                                                "default_process_id": None, "sort_order": 50, "is_active": False})
    show("deactivate type 50", s, b)
    print("  type 50 in active list:", T1 in active_type_ids())
    print("  issue detail:", issue_view(I_T))
    s, b = create_issue(door["ID"], T1, "catalog-test inactive type")
    show("new issue with inactive type", s, b)
    s, b = call("DELETE", f"/defect-types/{T1}")
    show("delete used type 50", s, b)
    s, b = call("DELETE", f"/defect-types/{T_DUP}")
    show("delete unused type 51", s, b)
    s, b = call("PATCH", f"/defect-types/{T1}", {"code": "50", "name_tr": "Test kusur", "name_en": "Test defect",
                                                "default_process_id": None, "sort_order": 50, "is_active": True})
    show("reactivate type 50", s, b)
    print("  type 50 in active list:", T1 in active_type_ids())

    # ------------------------------------------------------------------
    head("8. Sorumlu süreç pasife alınırsa")
    asm = procs["ASSEMBLY"]
    t05 = types["05"]
    print(f"  type 05 '{t05['NameTR']}' default process = {t05['ProcessCode']} (id {t05['DefaultProcessID']})")
    s, b = call("PATCH", f"/defect-processes/{asm['ID']}", {"code": asm["Code"], "name_tr": asm["NameTR"],
                                                            "name_en": asm["NameEN"], "sort_order": asm["SortOrder"],
                                                            "is_active": False})
    show("deactivate process ASSEMBLY", s, b)
    print("  ASSEMBLY in active process list:", asm["ID"] in active_process_ids())
    s, b = create_issue(door["ID"], t05["ID"], "catalog-test issue with type whose default process is inactive")
    show("new issue with type 05", s, b, ["ID", "ResponsibleProcessID"])
    I_P = b["ID"]
    print("  DB responsible_process_id:", sql(f"select i.responsible_process_id, p.code, p.is_active from issue_list i "
                                              f"join defect_processes p on p.id=i.responsible_process_id where i.id={I_P}"))
    # What the web/mobile editors send: the stored (hidden) process id unchanged
    s, b = call("PATCH", f"/issues/{I_P}/classification", {"defect_part_id": parts["10-02"]["ID"],
                                                          "defect_type_id": t05["ID"],
                                                          "responsible_process_id": asm["ID"]})
    show("edit classification (part change, hidden process sent back as-is)", s, b)
    s, b = call("PATCH", f"/issues/{I_P}/classification", {"defect_part_id": parts["10-02"]["ID"],
                                                          "defect_type_id": t05["ID"],
                                                          "responsible_process_id": None})
    show("same edit with process=null", s, b, ["ID", "ResponsibleProcessID"])
    s, b = call("DELETE", f"/defect-processes/{asm['ID']}")
    show("delete process ASSEMBLY (default of types)", s, b)
    s, b = call("PATCH", f"/defect-processes/{asm['ID']}", {"code": asm["Code"], "name_tr": asm["NameTR"],
                                                            "name_en": asm["NameEN"], "sort_order": asm["SortOrder"],
                                                            "is_active": True})
    show("reactivate process ASSEMBLY", s, b)

    # ------------------------------------------------------------------
    head("Temizlik (yalnız bu betiğin oluşturdukları; veritabanı sonra tamamen silinecek)")
    my_issues = [i for i in [I1, I_LEGACY, I_REACT, I_ZONE, I_OTHER, I_T, I_P] if i]
    ids = ",".join(str(i) for i in my_issues)
    print("  issues created:", ids)
    print("  audit rows for them:", sql(f"select count(*) from audit_logs where (metadata->>'issue_id')::bigint in ({ids})"))


if __name__ == "__main__":
    sys.exit(main())
