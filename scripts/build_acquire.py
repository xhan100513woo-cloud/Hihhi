#!/usr/bin/env python3
"""포켓몬 GO 획득 경로 데이터(bot/acquire.json)를 만듭니다.

사용법:
    python3 scripts/build_acquire.py <다운로드한_JSON_폴더>

필요한 파일 (폴더 안, https://pogoapi.net/api/v1/<이름>):
    pokemon_evolutions.json, pokemon_rarity.json, raid_exclusive_pokemon.json,
    research_task_exclusive_pokemon.json, photobomb_exclusive_pokemon.json,
    pvp_exclusive_pokemon.json, nesting_pokemon.json, possible_ditto_pokemon.json,
    shiny_pokemon.json, baby_pokemon.json
    species.csv  (PokeAPI data/v2/csv/pokemon_species.csv — 베이비 여부)

주의: pogoapi 의 '현재 레이드·이벤트' 데이터는 최신이 아니라서 쓰지 않습니다.
진화·전용 획득처처럼 잘 바뀌지 않는 정보만 담습니다.
"""
import csv
import json
import os
import sys

src = sys.argv[1]
out = os.path.join(os.path.dirname(__file__), "..", "bot", "acquire.json")


def load(name):
    with open(os.path.join(src, name), encoding="utf-8") as f:
        return json.load(f)


REGIONAL_FORMS = {"Normal", "Alola", "Galarian", "Hisuian", "Paldea"}
data = {}


def entry(pid):
    return data.setdefault(str(pid), {})


def cond(v):
    c = {"candy": v.get("candy_required", 0)}
    for k_src, k in [("item_required", "item"), ("lure_required", "lure"), ("buddy_distance_required", "buddyKm"),
                     ("gender_required", "gender")]:
        if k_src in v:
            c[k] = v[k_src]
    for k_src, k in [("only_evolves_in_daytime", "day"), ("only_evolves_in_nighttime", "night"),
                     ("must_be_buddy_to_evolve", "buddy"), ("no_candy_cost_if_traded", "tradeFree"),
                     ("upside_down", "upsideDown")]:
        if v.get(k_src):
            c[k] = True
    return c


# 진화 (지역 폼만 구분해서 표시, 비비용 무늬 같은 코스튬 폼은 기본 하나로 합침)
seen = set()
for x in load("pokemon_evolutions.json"):
    if x["form"] not in REGIONAL_FORMS:
        continue
    for v in x["evolutions"]:
        if v.get("form", "Normal") not in REGIONAL_FORMS:
            continue
        key = (x["pokemon_id"], v["pokemon_id"], x["form"], v.get("form", "Normal"), v.get("item_required"), v.get("lure_required"))
        if key in seen:
            continue
        seen.add(key)
        c = cond(v)
        form = x["form"] if x["form"] != "Normal" else (v.get("form") if v.get("form") not in (None, "Normal") else None)
        if form:
            c["form"] = form
        entry(x["pokemon_id"]).setdefault("to", []).append({"id": v["pokemon_id"], **c})
        entry(v["pokemon_id"]).setdefault("from", []).append({"id": x["pokemon_id"], **c})

for kind, items in load("pokemon_rarity.json").items():
    if kind == "Standard":
        continue
    for x in items:
        entry(x["pokemon_id"])["rarity"] = kind

for x in load("raid_exclusive_pokemon.json").values():
    entry(x["id"])["raidOnly"] = x.get("raid_level", 0)
for x in load("research_task_exclusive_pokemon.json"):
    entry(x["id"])["researchOnly"] = True
for x in load("photobomb_exclusive_pokemon.json"):
    entry(x["id"])["photobombOnly"] = True
for x in load("pvp_exclusive_pokemon.json"):
    entry(x["id"])["gblOnly"] = True
for x in load("nesting_pokemon.json").values():
    entry(x["id"])["nest"] = True
for x in load("baby_pokemon.json"):
    entry(x["id"])["baby"] = True
with open(os.path.join(src, "species.csv"), encoding="utf-8") as f:
    for row in csv.DictReader(f):
        if row["is_baby"] == "1":
            entry(int(row["id"]))["baby"] = True
entry(132)["dittoDisguises"] = sorted(x["id"] for x in load("possible_ditto_pokemon.json").values())
# 이로치 출시 여부만 사용 (방법별 플래그는 부정확한 경우가 있어 쓰지 않음)
for x in load("shiny_pokemon.json").values():
    entry(x["id"])["shiny"] = True

# 지역 한정 (대표적인 것만, 이벤트 때는 다른 지역에도 나올 수 있음)
REGIONS = {
    83: "아시아", 115: "호주", 122: "유럽", 128: "북아메리카", 214: "중남미",
    222: "열대 지방 (적도 부근)", 324: "남아시아·동남아시아", 313: "유럽·아시아·호주", 314: "아메리카·아프리카",
    335: "반구별 교대 출현 (세비퍼와 번갈아)", 336: "반구별 교대 출현 (쟝고와 번갈아)",
    337: "동반구 (아메리카 외)", 338: "서반구 (아메리카)", 357: "아프리카", 369: "뉴질랜드 주변",
    417: "북쪽 추운 지역 (캐나다·알래스카·러시아 등)", 441: "남반구", 455: "미국 남동부",
    511: "아시아·태평양", 513: "유럽·중동·아프리카·인도", 515: "아메리카",
    538: "아메리카·아프리카", 539: "유럽·아시아·호주", 556: "중남미", 561: "이집트·그리스",
    626: "미국 뉴욕 주변", 631: "서반구", 632: "동반구", 701: "멕시코", 707: "프랑스", 874: "영국",
}
for pid, region in REGIONS.items():
    entry(pid)["region"] = region

with open(out, "w", encoding="utf-8") as f:
    json.dump({k: data[k] for k in sorted(data, key=int)}, f, ensure_ascii=False, separators=(",", ":"))
print("wrote", out, len(data), "species")
