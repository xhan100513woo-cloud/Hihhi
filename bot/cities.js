"use strict";
// 도시 이름을 검색하면 그 도시의 핵심 장소 TOP 10 좌표 (Wikidata 기준, scripts/build_cities.py 로 생성)
const CITIES = require("./cities.json");

const key = (s) => String(s || "").toLowerCase().replace(/[\s.\-·]/g, "");
const INDEX = new Map();
// "서울특별시" → "서울", "도쿄도" → "도쿄", "오사카시" → "오사카" 처럼 짧은 이름도 검색되게
const short = (s) => String(s || "").replace(/(특별자치도|특별자치시|특별시|광역시|자치시|시|도)$/, "");
for (const c of CITIES) {
  for (const n of [c.name, c.ko, c.en, ...(c.aliases || []), short(c.ko)]) if (n && n.length >= 2 && !INDEX.has(key(n))) INDEX.set(key(n), c);
}

/** 메시지 전체가 도시 이름이면 그 도시 (뉴욕, New York, NYC ...) */
function findCity(content) {
  return INDEX.get(key(content)) || null;
}

const isCityListCommand = (content) => key(content) === "도시목록";

function cityEmbed(c) {
  const lines = c.places.map((p, i) => `**${i + 1}. ${p.name}** : \`${p.lat}, ${p.lng}\``);
  return {
    embeds: [{
      title: `📍 ${c.name || c.ko || c.en}${c.country ? ` (${c.country})` : ""} 핵심 장소 TOP ${c.places.length}`,
      description: (lines.join("\n") || "장소 정보가 없어요.").slice(0, 4000),
      color: 0x5865f2,
      footer: { text: "순위: 위키백과 문서가 있는 언어 수(많이 알려진 순) · 출처: Wikidata" },
    }],
    allowedMentions: { parse: [] },
  };
}

function cityListMessage() {
  const names = CITIES.map((c) => c.name || c.ko || c.en).join(", ");
  return { content: `🗺️ 검색할 수 있는 도시 (${CITIES.length}곳)\n${names}`.slice(0, 2000), allowedMentions: { parse: [] } };
}

module.exports = { findCity, isCityListCommand, cityEmbed, cityListMessage, CITIES };
