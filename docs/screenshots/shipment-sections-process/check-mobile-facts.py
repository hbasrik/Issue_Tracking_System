"""Read the mobile harness facts: section headings and item numbers in screen order."""
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
facts = json.load(open(os.path.join(HERE, "mobile", "facts.json")))
titles = {
    "tr": ["İç Montaj & Kesim İşleri", "Şasi & Dış Donanım", "Logo, Etiket & İç Parça",
           "Kauçuk, Kaplama & Küçük Montaj", "Fren Ayarı & Sızdırmazlık", "Son Ayar & Kontroller",
           "Soğuk Sıkma Testi", "BCM / EE Fonksiyon Kontrol", "Sürüş Testi", "Fren Testi", "Rot Testi",
           "Sıcak Sıkma Testi", "Mühendislik & Kalite Kontrol"],
    "en": ["Interior fitting & cutting", "Chassis & exterior fittings", "Logos, labels & interior parts",
           "Rubbers, films & small fittings", "Brake adjustment & sealing", "Final adjustments & checks",
           "Cold drag test", "BCM / EE function check", "Road test", "Brake test", "Wheel alignment test",
           "Hot drag test", "Engineering & quality check"],
}
entries = facts if isinstance(facts, list) else [dict(v, id=k) for k, v in facts.items()]
for f in entries:
    name = f.get("id") or f.get("name")
    locale = "en" if "-en-" in name else "tr"
    known = {t.upper(): t for t in titles[locale]} | {t: t for t in titles[locale]}
    groups, order = [], []
    for line in f["lines"]:
        line = line.strip()
        if line in known:
            groups.append([known[line], []])
            continue
        m = re.match(r"^(\d+)\.\s", line)
        if m and groups:
            groups[-1][1].append(int(m.group(1)))
            order.append(int(m.group(1)))
    print(name, " | ".join(f"{g} ({n[0]}-{n[-1]})" if n else f"{g} (empty)" for g, n in groups))
    print(f"  first item #{order[0] if order else None}; order 1..{len(order)} intact: {order == list(range(1, len(order) + 1))}")
