#!/usr/bin/env python3
"""pogoapi.net + PokeAPI 데이터를 내려받아 data.js 를 생성합니다.

사용법:
    python3 scripts/build_data.py <다운로드한_JSON_폴더>

필요한 파일 (폴더 안):
    pokemon_stats.json, pokemon_types.json, cp_multiplier.json,
    released_pokemon.json, mega.json  (https://pogoapi.net/api/v1/...)
    names.csv  (PokeAPI data/v2/csv/pokemon_species_names.csv)
"""
import csv
import json
import os
import sys

src = sys.argv[1]
out = os.path.join(os.path.dirname(__file__), "..", "data.js")


def load(name):
    with open(os.path.join(src, name), encoding="utf-8") as f:
        return json.load(f)


stats = load("pokemon_stats.json")
types = {(t["pokemon_id"], t["form"]): t["type"] for t in load("pokemon_types.json")}
released = {int(k) for k in load("released_pokemon.json").keys()}
megas = load("mega.json")
cpm_raw = load("cp_multiplier.json")

names = {}
with open(os.path.join(src, "names.csv"), encoding="utf-8") as f:
    for row in csv.DictReader(f):
        sid, lang = int(row["pokemon_species_id"]), int(row["local_language_id"])
        if lang in (3, 9):
            names.setdefault(sid, {})["ko" if lang == 3 else "en"] = row["name"]

# pogoapi 에 없는 포켓몬 보충 (본가 종족값 → GO 공식으로 계산한 값)
stats.append({"pokemon_id": 902, "form": "Normal", "pokemon_name": "Basculegion",
              "base_attack": 217, "base_defense": 144, "base_stamina": 260})
types.setdefault((902, "Normal"), ["Water", "Ghost"])

species = {}
for s in stats:
    pid = s["pokemon_id"]
    t = types.get((pid, s["form"]))
    if not t:
        continue
    sp = species.setdefault(pid, {"forms": []})
    entry = {"f": s["form"], "t": t,
             "s": [s["base_attack"], s["base_defense"], s["base_stamina"]]}
    sp["forms"].append(entry)

result = {}
for pid, sp in sorted(species.items()):
    forms = sp["forms"]
    # Normal 을 맨 앞으로, 능력치/타입이 같은 코스튬 폼은 제거
    forms.sort(key=lambda e: (e["f"] != "Normal", e["f"]))
    seen, uniq = set(), []
    for e in forms:
        key = (tuple(e["s"]), tuple(e["t"]))
        if key in seen:
            continue
        seen.add(key)
        uniq.append(e)
    for m in megas:
        if m["pokemon_id"] == pid:
            st = m["stats"]
            uniq.append({"f": "MEGA:" + m["mega_name"], "t": m["type"],
                         "s": [st["base_attack"], st["base_defense"], st["base_stamina"]]})
    n = names.get(pid, {})
    result[pid] = {"ko": n.get("ko", ""), "en": n.get("en", ""),
                   "r": pid in released, "forms": uniq}

cpm = {}
for c in cpm_raw:
    cpm[float(c["level"])] = c["multiplier"]
# 45.5 ~ 51 레벨 (0.5 레벨마다 +0.0025)
lv, v = 45.5, cpm[45.0]
while lv <= 51.0:
    v += 0.0025
    cpm[lv] = round(v, 8)
    lv += 0.5
cpm_list = [cpm[l / 2] for l in range(2, 103)]  # 1.0 ~ 51.0

with open(out, "w", encoding="utf-8") as f:
    f.write("// 자동 생성 파일 - scripts/build_data.py 로 다시 만들 수 있습니다.\n")
    f.write("// 출처: pogoapi.net (포켓몬 GO 능력치/타입), PokeAPI (한국어 이름)\n")
    f.write("window.CPM = " + json.dumps(cpm_list) + ";\n")
    f.write("window.POKEDEX = " + json.dumps(result, ensure_ascii=False, separators=(",", ":")) + ";\n")
print("wrote", out, len(result), "species")
