#!/usr/bin/env python3
"""주요 도시별 핵심 장소 좌표(bot/cities.json)를 Wikidata 에서 만듭니다.

사용법:  python3 scripts/build_cities.py

- 순위: 위키백과 문서가 있는 언어 수(sitelinks)가 많은 순 = 많이 알려진 곳
- 도시 안(행정구역 2단계까지)에 있고 좌표가 있는 장소만, 기관·회사·학교·사건·교통망 등과 도시 중심에서 50km 넘는 곳은 제외
- 데이터는 QLever(Wikidata 사본 SPARQL)에서 조회합니다 (전체 1~2분)
"""
import json
import os
import sys
import time
import urllib.parse
import urllib.request

OUT = os.path.join(os.path.dirname(__file__), "..", "bot", "cities.json")
UA = "pokego-dex-bot/1.0 (Discord bot city lookup; https://github.com/xhan100513woo-cloud/Hihhi)"
TOP = 10
PAUSE = 1      # 요청 사이 대기(초)

# (Wikidata ID, 추가로 검색될 별칭)
CITIES = [
    ("Q8684", ["서울시", "서울특별시"]), ("Q16520", ["부산시", "부산광역시"]), ("Q20934", ["인천시"]),
    ("Q20927", ["대구시"]), ("Q20921", ["대전시"]), ("Q41283", ["광주시"]), ("Q41164", ["제주", "제주도", "제주시"]),
    ("Q1490", ["동경"]), ("Q35765", []), ("Q34600", []), ("Q37951", []), ("Q38283", []), ("Q11751", []), ("Q26600", []),
    ("Q1867", ["타이페이"]), ("Q8646", []), ("Q334", ["싱가폴"]), ("Q1861", []), ("Q1461", []), ("Q3630", []),
    ("Q1865", ["쿠알라룸프르"]), ("Q1858", []), ("Q1854", ["사이공", "호치민"]), ("Q8686", []), ("Q956", ["북경"]),
    ("Q3130", []), ("Q3141", []), ("Q726917", ["오클랜드", "Auckland"]),
    ("Q60", ["뉴욕시", "NYC", "New York"]), ("Q65", ["LA", "엘에이"]), ("Q62", ["샌프란", "SF"]), ("Q1297", []),
    ("Q23768", ["라스베가스"]), ("Q5083", []), ("Q8652", []), ("Q18094", []), ("Q172", []), ("Q24639", []),
    ("Q1489", []), ("Q174", []), ("Q8678", ["리우"]), ("Q1486", []),
    ("Q23306", ["런던", "London", "그레이터 런던"]), ("Q90", []), ("Q64", []), ("Q220", []), ("Q2807", []), ("Q1492", []), ("Q9899", ["암스테르담", "Amsterdam"]), ("Q1085", []),
    ("Q1741", ["비엔나"]), ("Q1726", ["뮌헨"]), ("Q490", []), ("Q406", []), ("Q612", []), ("Q649", []), ("Q85", []),
]

# 제목에 보여 줄 이름 (Wikidata 이름이 행정구역 이름일 때)
DISPLAY = {"Q23306": "런던", "Q726917": "오클랜드", "Q41164": "제주", "Q9899": "암스테르담"}

EXCLUDE = ("wd:Q43229 wd:Q4830453 wd:Q3918 wd:Q891723 wd:Q783794 wd:Q1664720 wd:Q35127 wd:Q215380 wd:Q476028 "
           "wd:Q2088357 wd:Q11032 wd:Q17149090 wd:Q5 wd:Q1137809 wd:Q15911314 wd:Q1047437 wd:Q163740 wd:Q7278 "
           "wd:Q2385804 wd:Q38723 wd:Q1371037 wd:Q31855 wd:Q19844914 wd:Q902104")


PREFIXES = """PREFIX wd: <http://www.wikidata.org/entity/> PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX wikibase: <http://wikiba.se/ontology#> PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
"""
# Wikidata 공식 SPARQL 은 장애·요청 제한(분당 1회)이 잦아서, 같은 Wikidata 데이터를 제공하는 QLever 를 사용
ENDPOINT = "https://qlever.dev/api/wikidata"


# 하위 분류까지 제외: 사건(occurrence), 교육기관, 교통망·대중교통 체계, 스포츠 시즌/대회
EXCLUDE_TREE = ("wd:Q1190554 wd:Q2385804 wd:Q924286 wd:Q5503 wd:Q178512 wd:Q27020041 wd:Q13406554 "
                "wd:Q4022 wd:Q484652 wd:Q11691")   # + 강, 국제기구, 증권거래소
MAX_KM = 50   # 도시 중심에서 이보다 먼 좌표는 제외 (도시 밖 섬·전투 장소 등)


def km(a, b):
    import math
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


def sparql(q, tries=4):
    url = ENDPOINT + "?" + urllib.parse.urlencode({"query": PREFIXES + q})
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/sparql-results+json"})
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)["results"]["bindings"]
        except Exception as e:  # 429·502 등은 잠시 후 재시도
            wait = 10 * (i + 1)
            print(f"  재시도 {i + 1} ({e}) {wait}s 대기", file=sys.stderr)
            time.sleep(wait)
    raise RuntimeError("Wikidata 요청 실패")


def point(s):  # "Point(lng lat)"
    lng, lat = s[s.index("(") + 1:s.index(")")].split()
    return round(float(lat), 6), round(float(lng), 6)


def main():
    ids = " ".join("wd:" + q for q, _ in CITIES)
    info = {}
    for b in sparql(f"""SELECT ?c ?ko ?en ?countryKo WHERE {{ VALUES ?c {{ {ids} }}
        OPTIONAL {{ ?c rdfs:label ?ko FILTER(lang(?ko)="ko") }} OPTIONAL {{ ?c rdfs:label ?en FILTER(lang(?en)="en") }}
        OPTIONAL {{ ?c wdt:P625 ?ccoord }}
        OPTIONAL {{ ?c wdt:P17 ?country . ?country rdfs:label ?countryKo FILTER(lang(?countryKo)="ko") }} }}"""):
        q = b["c"]["value"].rsplit("/", 1)[1]
        info.setdefault(q, {"ko": b.get("ko", {}).get("value", ""), "en": b.get("en", {}).get("value", ""),
                            "country": b.get("countryKo", {}).get("value", ""),
                            "center": point(b["ccoord"]["value"]) if "ccoord" in b else None})
    rows_by_city = {}
    for q, _ in CITIES:
        print("조회:", info.get(q, {}).get("ko") or q, file=sys.stderr)
        rows_by_city[q] = sparql(f"""SELECT ?item ?ko ?en ?coord ?links WHERE {{
            {{ ?item wdt:P131 wd:{q} }} UNION {{ ?item wdt:P131/wdt:P131 wd:{q} }}
            ?item wdt:P625 ?coord ; wikibase:sitelinks ?links . FILTER(?links >= 10)
            MINUS {{ ?item wdt:P31 ?t . VALUES ?t {{ {EXCLUDE} }} }}
            MINUS {{ ?item wdt:P31/wdt:P279* ?bad . VALUES ?bad {{ {EXCLUDE_TREE} }} }}
            OPTIONAL {{ ?item rdfs:label ?ko FILTER(lang(?ko)="ko") }}
            OPTIONAL {{ ?item rdfs:label ?en FILTER(lang(?en)="en") }} }}
            ORDER BY DESC(?links) LIMIT 60""")
        time.sleep(PAUSE)
    result = []
    for q, aliases in CITIES:
        meta = info.get(q, {})
        seen, places = set(), []
        for b in sorted(rows_by_city[q], key=lambda b: -int(b["links"]["value"])):
            item = b["item"]["value"]
            name = b.get("ko", {}).get("value") or b.get("en", {}).get("value") or ""
            if item in seen or not name:
                continue
            seen.add(item)
            lat, lng = point(b["coord"]["value"])
            if meta.get("center") and km(meta["center"], (lat, lng)) > MAX_KM:
                continue
            places.append({"name": name, "lat": lat, "lng": lng})
            if len(places) >= TOP:
                break
        print(f"{meta.get('ko')}: {len(places)}개", file=sys.stderr)
        result.append({"id": q, "name": DISPLAY.get(q, ""), "ko": meta.get("ko", ""), "en": meta.get("en", ""), "country": meta.get("country", ""),
                       "aliases": aliases, "places": places})
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=0)
    print("wrote", OUT, len(result), "cities", file=sys.stderr)


if __name__ == "__main__":
    main()
