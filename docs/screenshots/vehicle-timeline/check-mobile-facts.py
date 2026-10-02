#!/usr/bin/env python3
"""Mobile timeline text check on mobile/facts.json (react-native-web harness).

The timeline section is the last block of the vehicle screen; its text starts
at the title line. Checks: all five kinds present, three folded checklist
runs, the dev-reset tag on two rows, filters split by kind, and no raw stored
value in the collapsed, expanded or filtered text (same patterns as web).
"""
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
facts = json.load(open(os.path.join(HERE, "mobile", "facts.json")))
RAW = [
    re.compile(r"\b[A-Z]{2,}(?:_[A-Z0-9]+)+\b"),
    re.compile(r"\b[a-z]+_[a-z_]+\b"),
    re.compile(r"\btimeline\.[a-zA-Z.]+"),
    re.compile(r"\b(PENDING|OPEN|DONE|APPROVED|BRANCH|DEPOT|COMPLETED|REWORK|DELIVERED)\b"),
    re.compile(r"Unknown value|Bilinmeyen değer"),
]
EXPECT = {
    "tr": {"title": "Araç zaman çizelgesi", "tag": "Geliştirme sıfırlaması", "group": "işaretleme",
           "ship": "Fabrikadan depoya sevk edildi", "to_wh": "Araç depoya alındı", "reset": "Araç hatta geri alındı",
           "hold": "Beklemeye alındı", "release": "Beklemeden çıkarıldı", "class": "sınıflandırması düzeltildi",
           "item": "Bekliyor → Uygun"},
    "en": {"title": "Vehicle timeline", "tag": "Development reset", "group": "checklist marks",
           "ship": "Shipped from factory to depot", "to_wh": "Vehicle moved to warehouse",
           "reset": "Vehicle returned to the line", "hold": "Put on hold", "release": "Released from hold",
           "class": "classification corrected", "item": "Pending → OK"},
}
failed = []


def check(label, ok, detail=""):
    print(f"  [{'PASS' if ok else 'FAIL'}] {label}" + (f" — {detail}" if detail else ""))
    if not ok:
        failed.append(label)


def section(lines, title):
    return lines[lines.index(title):]


for key, v in facts.items():
    locale = key.split("-")[2]
    e = EXPECT[locale]
    print(f"== {key} ==")
    base = section(v["lines"], e["title"])
    opened = section(v["clicked"]["timeline-group-toggle"], e["title"])
    status = section(v["clicked"]["timeline-filter-status"], e["title"])
    issue = section(v["clicked"]["timeline-filter-issue"], e["title"])
    text = "\n".join(base)
    print(f"  collapsed timeline: {len(base)} lines; first group expanded: {len(opened)} lines")
    check("errors / overflow", not v["errors"] and v["overflow"] == 0, f"errors {len(v['errors'])}, overflow {v['overflow']}")
    for k in ("ship", "to_wh", "reset", "hold", "release", "class"):
        check(f"shows “{e[k]}”", e[k] in text)
    check("dev-reset tag on two rows", base.count(e["tag"]) == 2, str(base.count(e["tag"])))
    check("three folded checklist runs", sum(1 for l in base if e["group"] in l) == 3)
    check("expanding shows item rows", e["item"] in "\n".join(opened) and len(opened) > len(base))
    check("status filter hides checklist and issue rows",
          not any(e["group"] in l for l in status) and not any("#17" in l for l in status) and e["ship"] in status)
    check("issue filter shows only issue rows",
          not any(e["group"] in l for l in issue) and e["hold"] not in issue and any("#17" in l for l in issue))
    raw = sorted({m.group(0) for lines in (base, opened, status, issue) for l in lines for r in RAW for m in r.finditer(l)})
    check("no raw stored value in any view", not raw, ", ".join(raw) or "none")

print("\nALL CHECKS PASSED" if not failed else "\nFAILED: " + "; ".join(failed))
sys.exit(1 if failed else 0)
