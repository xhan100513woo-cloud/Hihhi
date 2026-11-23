"use strict";
// 포켓몬 GO 계산 로직 (웹 버전 app.js 와 동일한 규칙)
const fs = require("fs");
const path = require("path");
const vm = require("vm");

// ../data.js (window.POKEDEX, window.CPM) 를 그대로 읽어온다
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "data.js"), "utf8"), sandbox);
const DEX = sandbox.window.POKEDEX;
const CPM = sandbox.window.CPM;
const MAX_ID = Math.max(...Object.keys(DEX).map(Number));

const TYPES = {
  Normal: ["노말", "⚪"], Fire: ["불꽃", "🔥"], Water: ["물", "💧"], Electric: ["전기", "⚡"],
  Grass: ["풀", "🌿"], Ice: ["얼음", "❄️"], Fighting: ["격투", "🥊"], Poison: ["독", "☠️"],
  Ground: ["땅", "⛰️"], Flying: ["비행", "🪶"], Psychic: ["에스퍼", "🔮"], Bug: ["벌레", "🐛"],
  Rock: ["바위", "🪨"], Ghost: ["고스트", "👻"], Dragon: ["드래곤", "🐉"], Dark: ["악", "🌑"],
  Steel: ["강철", "⚙️"], Fairy: ["페어리", "✨"],
};
const TYPE_COLOR = {
  Normal: 0x9fa19f, Fire: 0xe62829, Water: 0x2980ef, Electric: 0xe0b400, Grass: 0x3fa129,
  Ice: 0x3dcef3, Fighting: 0xff8000, Poison: 0x9141cb, Ground: 0x915121, Flying: 0x81b9ef,
  Psychic: 0xef4179, Bug: 0x91a119, Rock: 0xafa981, Ghost: 0x704170, Dragon: 0x5060e1,
  Dark: 0x624d4e, Steel: 0x60a1b8, Fairy: 0xef70ef,
};
const TYPE_LIST = Object.keys(TYPES);

// 공격 타입 → [효과 굉장, 효과 별로, 효과 없음(GO에서는 이중 저항)]
const CHART = {
  Normal: [[], ["Rock", "Steel"], ["Ghost"]],
  Fire: [["Grass", "Ice", "Bug", "Steel"], ["Fire", "Water", "Rock", "Dragon"], []],
  Water: [["Fire", "Ground", "Rock"], ["Water", "Grass", "Dragon"], []],
  Electric: [["Water", "Flying"], ["Electric", "Grass", "Dragon"], ["Ground"]],
  Grass: [["Water", "Ground", "Rock"], ["Fire", "Grass", "Poison", "Flying", "Bug", "Dragon", "Steel"], []],
  Ice: [["Grass", "Ground", "Flying", "Dragon"], ["Fire", "Water", "Ice", "Steel"], []],
  Fighting: [["Normal", "Ice", "Rock", "Dark", "Steel"], ["Poison", "Flying", "Psychic", "Bug", "Fairy"], ["Ghost"]],
  Poison: [["Grass", "Fairy"], ["Poison", "Ground", "Rock", "Ghost"], ["Steel"]],
  Ground: [["Fire", "Electric", "Poison", "Rock", "Steel"], ["Grass", "Bug"], ["Flying"]],
  Flying: [["Grass", "Fighting", "Bug"], ["Electric", "Rock", "Steel"], []],
  Psychic: [["Fighting", "Poison"], ["Psychic", "Steel"], ["Dark"]],
  Bug: [["Grass", "Psychic", "Dark"], ["Fire", "Fighting", "Poison", "Flying", "Ghost", "Steel", "Fairy"], []],
  Rock: [["Fire", "Ice", "Flying", "Bug"], ["Fighting", "Ground", "Steel"], []],
  Ghost: [["Psychic", "Ghost"], ["Dark"], ["Normal"]],
  Dragon: [["Dragon"], ["Steel"], ["Fairy"]],
  Dark: [["Psychic", "Ghost"], ["Fighting", "Dark", "Fairy"], []],
  Steel: [["Ice", "Rock", "Fairy"], ["Fire", "Water", "Electric", "Steel"], []],
  Fairy: [["Fighting", "Dragon", "Dark"], ["Fire", "Poison", "Steel"], []],
};
const SE = 1.6, NVE = 0.625, IMMUNE = 0.390625;

function effectiveness(atk, def) {
  const [se, nve, im] = CHART[atk];
  if (se.includes(def)) return SE;
  if (nve.includes(def)) return NVE;
  if (im.includes(def)) return IMMUNE;
  return 1;
}

const FORM_KO = {
  Normal: "기본", Alola: "알로라", Galarian: "가라르", Hisuian: "히스이", Paldea: "팔데아",
  Female: "암컷", Male: "수컷", Origin: "오리진", Altered: "어나더", Therian: "영물", Incarnate: "화신",
  Attack: "어택", Defense: "디펜스", Speed: "스피드", Hero: "역전의 용사", Crowned_sword: "검왕",
  Crowned_shield: "방패왕", Sky: "스카이", Land: "랜드", Black: "블랙", White: "화이트",
  Armored: "아머드", Complete: "퍼펙트", Ten_percent: "10%", Fifty_percent: "50%",
  Complete_fifty_percent: "50%", Complete_ten_percent: "10%",
  Aria: "보이스", Pirouette: "스텝", Shield: "실드", Blade: "블레이드",
  Average: "보통", Small: "작은 사이즈", Large: "큰 사이즈", Super: "특대 사이즈",
  Confined: "굴레", Unbound: "해방", Baile: "이글이글", Pompom: "파칙파칙", Pau: "훌라훌라", Sensu: "하늘하늘",
  Midday: "한낮", Midnight: "한밤중", Dusk: "황혼", Solo: "단독", School: "군집",
  Ice: "아이스페이스", Noice: "나이스페이스", Single_strike: "일격", Rapid_strike: "연격",
  Standard: "노말", Zen: "달마", Galarian_standard: "가라르", Galarian_zen: "가라르 달마",
  Plant: "초목도롱", Sandy: "모래땅도롱", Trash: "슈레도롱",
};
// 같은 폼 이름이 포켓몬마다 다르게 불리는 경우
const SPECIES_FORM_KO = { 964: { Zero: "나이브", Hero: "마이티" } };

// 모습변화 포켓몬의 폼 순서: 기본 모습이 -1, 변화 모습이 -2 부터 (메가는 맨 뒤)
const FORM_ORDER = [
  "Normal", "Hero", "Incarnate", "Altered", "Land", "Aria", "Shield", "Average", "Confined", "Baile",
  "Midday", "Solo", "Ice", "Male", "Single_strike", "Standard", "Plant", "Zero", "Complete_fifty_percent",
  "Crowned_sword", "Crowned_shield", "Origin", "Sky", "Therian", "Pirouette", "Blade", "Small", "Large", "Super",
  "Unbound", "Pompom", "Pau", "Sensu", "Midnight", "Dusk", "School", "Noice", "Female", "Rapid_strike",
  "Zen", "Galarian_standard", "Galarian_zen", "Sandy", "Trash", "Complete_ten_percent", "Complete",
];
// 같은 폼 이름의 기본/변화가 포켓몬마다 다른 경우 (돌핀맨: 나이브가 기본, 마이티(Hero)가 변화)
const SPECIES_FORM_ORDER = { 964: ["Zero", "Hero"] };
for (const [id, sp] of Object.entries(DEX)) {
  const order = SPECIES_FORM_ORDER[id] || FORM_ORDER;
  const rank = (f) => {
    if (f.f.startsWith("MEGA:")) return 1e6;
    const i = order.indexOf(f.f);
    return i === -1 ? 1e3 : i;
  };
  sp.forms = sp.forms.map((f, i) => ({ f, i })).sort((a, b) => rank(a.f) - rank(b.f) || a.i - b.i).map((x) => x.f);
}

function formLabel(f, id) {
  if (f.startsWith("MEGA:")) return "메가 · " + f.slice(5);
  if (id && SPECIES_FORM_KO[id] && SPECIES_FORM_KO[id][f]) return SPECIES_FORM_KO[id][f];
  if (FORM_KO[f]) return FORM_KO[f];
  for (const k of Object.keys(FORM_KO)) if (f.startsWith(k + "_")) return FORM_KO[k] + " (" + f + ")";
  return f.replace(/_/g, " ");
}

const cpmAt = (lv) => CPM[Math.round((lv - 1) * 2)];
function calcCP([a, d, s], [ia, id, is], lv) {
  const m = cpmAt(lv);
  return Math.max(10, Math.floor((a + ia) * Math.sqrt(d + id) * Math.sqrt(s + is) * m * m / 10));
}
const calcHP = (s, is, lv) => Math.max(10, Math.floor((s + is) * cpmAt(lv)));
function levels(from = 1, to = 51) { const r = []; for (let l = from; l <= to; l += 0.5) r.push(l); return r; }

function findId(q) {
  q = String(q).trim().replace(/^#/, "");
  if (/^\d+$/.test(q)) return DEX[+q] ? +q : null;
  const low = q.toLowerCase();
  for (const [id, p] of Object.entries(DEX)) if (p.ko === q || p.en.toLowerCase() === low) return +id;
  for (const [id, p] of Object.entries(DEX)) if (p.ko.includes(q) || p.en.toLowerCase().includes(low)) return +id;
  return null;
}

/** 이름/번호 일부로 자동완성 후보 (최대 25개) */
function suggest(q) {
  q = String(q || "").trim().toLowerCase().replace(/^#/, "");
  const out = [];
  for (const [id, p] of Object.entries(DEX)) {
    if (!q || id.startsWith(q) || p.ko.includes(q) || p.en.toLowerCase().includes(q))
      out.push({ name: `#${id} ${p.ko} (${p.en})`, value: id });
    if (out.length >= 25) break;
  }
  return out;
}

/** 폼 선택: 1부터 시작하는 번호(1 = 기본 모습) 또는 폼 이름 일부 */
function pickForm(sp, form) {
  if (form === undefined || form === null || form === "") return sp.forms[0];
  if (/^\d+$/.test(String(form))) return sp.forms[+form - 1] || sp.forms[0];
  const q = String(form).toLowerCase();
  return sp.forms.find((f) => f.f.toLowerCase().includes(q) || formLabel(f.f).toLowerCase().includes(q)) || sp.forms[0];
}

function defenseGroups(types) {
  const groups = {};
  for (const atk of TYPE_LIST) {
    const m = types.reduce((acc, d) => acc * effectiveness(atk, d), 1);
    if (Math.abs(m - 1) < 1e-9) continue;
    (groups[m] = groups[m] || []).push(atk);
  }
  return Object.keys(groups).map(Number).sort((a, b) => b - a).map((m) => ({ mult: m, types: groups[m] }));
}

function bestLeagueLevel(S, iv, cap) {
  let best = null;
  for (const l of levels()) if (calcCP(S, iv, l) <= cap) best = l;
  return best;
}

function findIVs(S, cp, hp, floor = 0) {
  const res = [];
  for (const lv of levels())
    for (let a = floor; a <= 15; a++) for (let d = floor; d <= 15; d++) for (let s = floor; s <= 15; s++) {
      if (calcCP(S, [a, d, s], lv) !== cp) continue;
      if (hp && calcHP(S[2], s, lv) !== hp) continue;
      res.push({ lv, iv: [a, d, s], pct: Math.round((a + d + s) / 45 * 100) });
    }
  return res;
}

/** 메시지가 도감번호만으로 이루어져 있으면 번호를 돌려준다 (예: "25", "#150", "No.6", "6번") */
/**
 * 도감번호(+모습 번호) 해석: "25", "#150", "No.6", "6번", "888-2" →
 * { id, form: 1부터 시작하는 모습 번호 | null, valid: 모습 번호가 범위 안인지 }
 */
function parseDexQuery(content) {
  const m = String(content).trim().match(/^(?:#|no\.?\s*)?0*(\d{1,4})(?:\s*-\s*(\d{1,2}))?(?:번)?$/i);
  if (!m) return null;
  const id = Number(m[1]);
  if (!DEX[id]) return null;
  const form = m[2] ? Number(m[2]) : null;
  return { id, form, valid: form === null || (form >= 1 && form <= DEX[id].forms.length) };
}

/** 메시지가 도감번호만으로 이루어져 있으면 번호를 돌려준다 (예: "25", "#150", "No.6", "6번", "888-2") */
function parseDexNumber(content) {
  const q = parseDexQuery(content);
  return q ? q.id : null;
}

/** "배틀111", "배틀 111", "배틀888-2", "배틀 리자몽", "배틀자시안-2" → { id, form, valid } */
// 이름 → 도감번호 (한국어 이름은 띄어쓰기 무시, 영어 이름은 대소문자 무시)
const nameKey = (s) => String(s).toLowerCase().replace(/\s+/g, "");
const NAME_INDEX = new Map();
for (const [id, p] of Object.entries(DEX)) {
  if (p.ko) NAME_INDEX.set(nameKey(p.ko), +id);
  if (p.en && !NAME_INDEX.has(nameKey(p.en))) NAME_INDEX.set(nameKey(p.en), +id);
}

/** 포켓몬 이름(+모습 번호)만으로 된 메시지: "리자몽", "charizard", "자시안-2" → { id, form, valid } (정확히 일치할 때만) */
function parseNameQuery(content) {
  const nm = String(content).trim().match(/^(.+?)(?:\s*-\s*(\d{1,2}))?$/);
  if (!nm) return null;
  const id = NAME_INDEX.get(nameKey(nm[1]));
  if (!id) return null;
  const form = nm[2] ? Number(nm[2]) : null;
  return { id, form, valid: form === null || (form >= 1 && form <= DEX[id].forms.length) };
}

/** "배틀111", "배틀 111", "배틀888-2", "배틀 리자몽", "배틀자시안-2" → { id, form, valid } */
function parseBattle(content) {
  const m = String(content).trim().match(/^배틀\s*(.+)$/);
  if (!m) return null;
  const q = m[1].trim();
  return parseDexQuery(q) || parseNameQuery(q);
}

/**
 * PvP 개체 순위: 각 개체값(4096개)을 리그 CP 상한 이하의 최고 레벨(maxLv 이하)까지 올렸을 때
 * 스탯곱(공격×방어×HP)이 큰 순서로 정렬해 상위 top 개를 돌려준다. 참가 불가면 빈 배열.
 */
function pvpRanks(S, cap = Infinity, maxLv = 50, top = 10) {
  const lvls = levels(1, maxLv).reverse();
  const res = [];
  for (let a = 0; a <= 15; a++) for (let d = 0; d <= 15; d++) for (let s = 0; s <= 15; s++) {
    const iv = [a, d, s];
    const lv = lvls.find((l) => calcCP(S, iv, l) <= cap);
    if (lv === undefined) continue;
    const m = cpmAt(lv);
    const sp = (S[0] + a) * m * (S[1] + d) * m * Math.floor((S[2] + s) * m);
    res.push({ iv, lv, cp: calcCP(S, iv, lv), sp });
  }
  res.sort((x, y) => y.sp - x.sp || y.cp - x.cp);
  const best = res.length ? res[0].sp : 1;
  return res.slice(0, top).map((r, i) => ({ ...r, rank: i + 1, pct: r.sp / best * 100 }));
}

/**
 * 채널이 감지 대상인지: 채널 ID가 같거나, 이모지·기호를 뺀 채널 이름에 설정한 이름이 들어 있으면 true.
 * 예) 설정 "포켓몬개체정보방" → "포켓몬개체정보방", "💬｜포켓몬개체정보방" 모두 해당. "*" 이면 모든 채널.
 */
const normName = (s) => String(s || "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
function channelMatches(channel, entries) {
  return entries.some((e) => e === "*" || e === channel.id || (normName(e) && normName(channel.name).includes(normName(e))));
}

/** 봇 전용 커스텀 이모지(속성 아이콘)로 TYPES 의 이모지를 바꾼다. map: { Fire: "<:pogo_fire:123>", ... } */
function setTypeEmojis(map) {
  for (const [t, e] of Object.entries(map)) if (TYPES[t] && e) TYPES[t][1] = e;
}

module.exports = { parseNameQuery, setTypeEmojis, channelMatches, parseDexQuery, parseDexNumber, parseBattle, pvpRanks,
  DEX, CPM, MAX_ID, TYPES, TYPE_COLOR, CHART, effectiveness, formLabel,
  calcCP, calcHP, cpmAt, levels, findId, suggest, pickForm, defenseGroups, bestLeagueLevel, findIVs,
};
