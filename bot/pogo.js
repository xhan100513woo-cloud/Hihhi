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
};
function formLabel(f) {
  if (f.startsWith("MEGA:")) return "메가 · " + f.slice(5);
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

/** 폼 선택: 인덱스 번호 또는 폼 이름 일부 */
function pickForm(sp, form) {
  if (form === undefined || form === null || form === "") return sp.forms[0];
  if (/^\d+$/.test(String(form)) && sp.forms[+form]) return sp.forms[+form];
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
function parseDexNumber(content) {
  const m = String(content).trim().match(/^(?:#|no\.?\s*)?0*(\d{1,4})(?:번)?$/i);
  if (!m) return null;
  const id = Number(m[1]);
  return DEX[id] ? id : null;
}

module.exports = { parseDexNumber,
  DEX, CPM, MAX_ID, TYPES, TYPE_COLOR, CHART, effectiveness, formLabel,
  calcCP, calcHP, cpmAt, levels, findId, suggest, pickForm, defenseGroups, bestLeagueLevel, findIVs,
};
