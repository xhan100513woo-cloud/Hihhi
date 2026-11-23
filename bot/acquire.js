"use strict";
// 포켓몬 GO 획득 경로 (진화·알·둥지·전용 획득처·지역 한정·날씨 부스트)
const P = require("./pogo");
const ACQ = require("./acquire.json");

const ITEM_KO = {
  "Sun Stone": "태양의돌", "King's Rock": "왕의징표석", "Metal Coat": "금속코트", "Dragon Scale": "용의비늘",
  "Upgrade": "업그레이드", "Sinnoh Stone": "신오의돌", "Unova Stone": "하나의돌",
  "Sweet Apple": "달콤한사과", "Tart Apple": "새콤한사과", "Syrupy Apple": "꿀맛사과",
};
const LURE_KO = {
  "Mossy Lure Module": "이끼 루어", "Glacial Lure Module": "빙하 루어",
  "Magnetic Lure Module": "자석 루어", "Rainy Lure Module": "비 루어",
};
const FORM_KO = { Alola: "알로라", Galarian: "가라르", Hisuian: "히스이", Paldea: "팔데아" };
// 야생 날씨 부스트 (타입 → 날씨)
const WEATHER = {
  Grass: "☀️ 맑음", Ground: "☀️ 맑음", Fire: "☀️ 맑음", Dark: "🌫️ 안개", Ghost: "🌫️ 안개",
  Fairy: "☁️ 흐림", Fighting: "☁️ 흐림", Poison: "☁️ 흐림", Normal: "⛅ 구름 조금", Rock: "⛅ 구름 조금",
  Water: "🌧️ 비", Electric: "🌧️ 비", Bug: "🌧️ 비", Ice: "❄️ 눈", Steel: "❄️ 눈",
  Dragon: "🌬️ 바람", Flying: "🌬️ 바람", Psychic: "🌬️ 바람",
};
const RARITY_KO = { Legendary: "전설", Mythic: "환상", "Ultra beast": "울트라비스트" };

const nameOf = (id) => (P.DEX[id] ? P.DEX[id].ko : `#${id}`);

/** 진화 조건 문장: "사탕 25개 · 태양의돌 · 낮에만" */
function condText(c) {
  const parts = [];
  if (c.candy) parts.push(`사탕 ${c.candy}개`);
  if (c.item) parts.push(ITEM_KO[c.item] || c.item);
  if (c.lure) parts.push(LURE_KO[c.lure] || c.lure);
  if (c.buddyKm) parts.push(`파트너로 ${c.buddyKm}km 걷기`);
  else if (c.buddy) parts.push("파트너로 설정");
  if (c.day) parts.push("낮에만");
  if (c.night) parts.push("밤에만");
  if (c.gender) parts.push(c.gender === "Male" ? "수컷만" : "암컷만");
  if (c.upsideDown) parts.push("휴대폰 거꾸로 들고");
  if (c.tradeFree) parts.push("교환하면 사탕 0개");
  return parts.join(" · ");
}
const formTag = (c) => (c.form ? ` (${FORM_KO[c.form] || c.form})` : "");

function weatherOf(types) {
  return [...new Set(types.map((t) => WEATHER[t]).filter(Boolean))].join(", ");
}

/** 획득 경로 줄 목록 */
function acquireLines(id) {
  const a = ACQ[id] || {};
  const sp = P.DEX[id];
  const lines = [];
  if (!sp.r) lines.push("❌ **포켓몬 GO 미출시** (데이터 기준)");
  if (a.rarity) {
    const how = a.rarity === "Mythic" ? "스페셜 리서치·이벤트 보상으로 획득" : "주로 5성·전설 레이드나 이벤트로 획득";
    lines.push(`👑 **${RARITY_KO[a.rarity] || a.rarity} 포켓몬** — ${how}`);
  }
  if (a.raidOnly) lines.push(`⚔️ **레이드 전용**${a.raidOnly ? ` (${a.raidOnly}성)` : ""}`);
  if (a.researchOnly) lines.push("📜 **리서치 전용** (필드·스페셜 리서치 보상)");
  if (a.photobombOnly) lines.push("📸 **GO 스냅샷 포토밤 전용**");
  if (a.gblOnly) lines.push("🏆 **GO 배틀리그 보상 전용**");
  if (a.baby) lines.push("🥚 **알 부화** (베이비 포켓몬 — 야생에서는 나오지 않음)");
  // 진화형인데 이전 단계가 베이비가 아니면 야생에서 드묾 (피카츄처럼 베이비에서 진화하는 건 흔함)
  const evolved = (a.from || []).some((c) => !(ACQ[c.id] || {}).baby);
  if (!a.rarity && !a.raidOnly && !a.researchOnly && !a.photobombOnly && !a.gblOnly && !a.baby && !a.dittoDisguises && sp.r) {
    lines.push(`🌿 **야생 출현**${evolved ? " (진화형이라 드물 수 있음)" : ""} — 날씨 부스트: ${weatherOf(sp.forms[0].t)}`);
  }
  if (a.nest) lines.push("🌳 **둥지 포켓몬** (둥지에서 많이 출현, 2주마다 바뀜)");
  if (a.region) lines.push(`🌏 **지역 한정**: ${a.region}`);
  if (a.dittoDisguises) lines.push(`🎭 **변장한 메타몽 잡기**: ${a.dittoDisguises.map(nameOf).join(", ")} 등으로 변장 (시기마다 바뀜)`);
  return lines;
}

/** /획득 · 포켓몬획득정보방 임베드 */
function acquireEmbed(id) {
  const sp = P.DEX[id], a = ACQ[id] || {};
  const fields = [];
  const ways = acquireLines(id);
  fields.push({ name: "📍 획득 방법", value: ways.join("\n") || "정보 없음" });
  if ((a.from || []).length)
    fields.push({ name: "⬅️ 진화로 얻기", value: a.from.map((c) => `${nameOf(c.id)}${formTag(c)} → ${sp.ko} : ${condText(c)}`).join("\n").slice(0, 1024) });
  if ((a.to || []).length)
    fields.push({ name: "➡️ 다음 진화", value: a.to.map((c) => `${sp.ko}${formTag(c)} → ${nameOf(c.id)} : ${condText(c)}`).join("\n").slice(0, 1024) });
  fields.push({ name: "✨ 이로치", value: a.shiny ? "출시됨" : "미출시 (데이터 기준)", inline: true });
  fields.push({ name: "타입", value: sp.forms[0].t.map((t) => `${P.TYPES[t][1]} ${P.TYPES[t][0]}`).join(" / "), inline: true });
  return {
    embeds: [{
      title: `No.${String(id).padStart(4, "0")} ${sp.ko} (${sp.en}) · 획득 경로`,
      color: P.TYPE_COLOR[sp.forms[0].t[0]],
      thumbnail: { url: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png` },
      fields,
      footer: { text: "현재 레이드·알·이벤트 출현은 시기마다 바뀌어 포함하지 않았어요 · 데이터: pogoapi.net, PokeAPI" },
    }],
  };
}

module.exports = { acquireEmbed, acquireLines, condText };
