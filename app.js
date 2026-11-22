"use strict";

// ───────── 타입 정보 ─────────
const TYPES = {
  Normal: ["노말", "#9fa19f"], Fire: ["불꽃", "#e62829"], Water: ["물", "#2980ef"],
  Electric: ["전기", "#e0b400"], Grass: ["풀", "#3fa129"], Ice: ["얼음", "#3dcef3"],
  Fighting: ["격투", "#ff8000"], Poison: ["독", "#9141cb"], Ground: ["땅", "#915121"],
  Flying: ["비행", "#81b9ef"], Psychic: ["에스퍼", "#ef4179"], Bug: ["벌레", "#91a119"],
  Rock: ["바위", "#afa981"], Ghost: ["고스트", "#704170"], Dragon: ["드래곤", "#5060e1"],
  Dark: ["악", "#624d4e"], Steel: ["강철", "#60a1b8"], Fairy: ["페어리", "#ef70ef"],
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
const SE = 1.6, NVE = 0.625, IMMUNE = 0.390625; // 포켓몬 GO 배율

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
  Shadow: "그림자", Armored: "아머드", Complete: "퍼펙트", Ten_percent: "10%", Fifty_percent: "50%",
};
function formLabel(f) {
  if (f.startsWith("MEGA:")) return "메가 · " + f.slice(5);
  if (FORM_KO[f]) return FORM_KO[f];
  for (const k of Object.keys(FORM_KO)) if (f.startsWith(k + "_")) return FORM_KO[k] + " (" + f + ")";
  return f.replace(/_/g, " ");
}

// ───────── CP / HP 계산 ─────────
const cpmAt = (lv) => window.CPM[Math.round((lv - 1) * 2)];
function calcCP([a, d, s], [ia, id, is], lv) {
  const m = cpmAt(lv);
  return Math.max(10, Math.floor((a + ia) * Math.sqrt(d + id) * Math.sqrt(s + is) * m * m / 10));
}
function calcHP(s, is, lv) { return Math.max(10, Math.floor((s + is) * cpmAt(lv))); }
function levels(from = 1, to = 51) { const r = []; for (let l = from; l <= to; l += 0.5) r.push(l); return r; }

// ───────── 상태 ─────────
const DEX = window.POKEDEX;
const MAX_ID = Math.max(...Object.keys(DEX).map(Number));
let cur = null; // { id, sp, form }
const $ = (id) => document.getElementById(id);
const typeBadge = (t) => `<span class="type" style="background:${TYPES[t][1]}">${TYPES[t][0]}</span>`;
const fmtMult = (m) => "×" + (Math.round(m * 1000) / 1000);

// 이름 자동완성
$("names").innerHTML = Object.entries(DEX)
  .map(([id, p]) => `<option value="${p.ko}">#${id} ${p.en}</option>`).join("");

function findId(q) {
  q = q.trim().replace(/^#/, "");
  if (/^\d+$/.test(q)) return DEX[+q] ? +q : null;
  const low = q.toLowerCase();
  for (const [id, p] of Object.entries(DEX)) if (p.ko === q || p.en.toLowerCase() === low) return +id;
  for (const [id, p] of Object.entries(DEX)) if (p.ko.includes(q) || p.en.toLowerCase().includes(low)) return +id;
  return null;
}

function show(id, formIdx = 0) {
  const sp = DEX[id];
  if (!sp) { $("msg").textContent = "해당 포켓몬을 찾을 수 없습니다. (1~" + MAX_ID + ")"; return; }
  $("msg").textContent = "";
  cur = { id, sp, form: sp.forms[formIdx] };
  $("result").hidden = false;
  $("no").textContent = "No." + String(id).padStart(4, "0");
  $("name").textContent = `${sp.ko} (${sp.en})`;
  $("art").src = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
  $("art").alt = sp.ko;
  $("released").textContent = sp.r ? "포켓몬 GO 출시됨" : "포켓몬 GO 미출시 (예상 수치)";
  $("form").innerHTML = sp.forms.map((f, i) => `<option value="${i}">${formLabel(f.f)}</option>`).join("");
  $("form").value = formIdx;
  $("form").hidden = sp.forms.length < 2;
  history.replaceState(null, "", "#" + id);
  render();
}

function render() {
  const f = cur.form, S = f.s;
  $("types").innerHTML = f.t.map(typeBadge).join("");

  // 능력치
  const names = ["공격", "방어", "체력"];
  $("stats").innerHTML = S.map((v, i) =>
    `<div class="bar"><span>${names[i]}</span><b>${v}</b><div class="track"><div class="fill" style="width:${Math.min(100, v / 4)}%"></div></div></div>`
  ).join("");

  // 최대 CP
  const H = [15, 15, 15];
  $("maxcp").innerHTML = [[40, "레벨 40"], [50, "레벨 50"], [51, "레벨 51 (최고의 친구)"]]
    .map(([lv, label]) => `<div class="stat"><span>${label}</span><b>${calcCP(S, H, lv)}</b><span>HP ${calcHP(S[2], 15, lv)}</span></div>`)
    .join("");

  // 방어 상성
  const groups = {};
  for (const atk of TYPE_LIST) {
    const m = f.t.reduce((acc, d) => acc * effectiveness(atk, d), 1);
    if (Math.abs(m - 1) < 1e-9) continue;
    (groups[m] = groups[m] || []).push(atk);
  }
  const keys = Object.keys(groups).map(Number).sort((a, b) => b - a);
  $("defense").innerHTML = keys.map((m) => {
    const cls = m > 1 ? "bad" : "good";
    const label = m > 1 ? (m > 2 ? "매우 약함" : "약함") : (m < 0.3 ? "매우 강함" : m < 0.5 ? "강함" : "저항");
    return `<div class="row"><span class="mult ${cls}">${fmtMult(m)}</span>${groups[m].map(typeBadge).join("")}<span class="muted">${label}</span></div>`;
  }).join("") || "<p class='muted'>특별한 약점/저항이 없습니다.</p>";

  // 공격 상성
  $("offense").innerHTML = f.t.map((t) => {
    const [se, nve, im] = CHART[t];
    return `<div class="row">${typeBadge(t)} 기술 → <span class="mult bad">×1.6</span>${se.map(typeBadge).join("") || "<span class='muted'>없음</span>"}</div>
      <div class="row muted" style="margin-left:4px">효과 별로: ${[...nve, ...im].map((x) => TYPES[x][0]).join(", ") || "없음"}</div>`;
  }).join("");

  // 상황별 CP 범위
  const range = (lv, floor) => `${calcCP(S, [floor, floor, floor], lv)} ~ ${calcCP(S, H, lv)}`;
  const rows = [
    ["필드 리서치 (Lv15)", 15, 10],
    ["레이드 · 알 부화 (Lv20)", 20, 10],
    ["레이드 날씨 부스트 (Lv25)", 25, 10],
    ["야생 최대 (Lv30)", 30, 0],
    ["날씨 부스트 야생 최대 (Lv35)", 35, 4],
  ];
  $("ranges").innerHTML = "<tr><th>상황</th><th>CP 범위</th><th>100% CP</th></tr>" +
    rows.map(([n, lv, fl]) => `<tr><td>${n}</td><td>${range(lv, fl)}</td><td><b>${calcCP(S, H, lv)}</b></td></tr>`).join("");

  renderIV();
  renderFind();
}

function clampIV(v) { v = Math.round(+v); return isNaN(v) ? 0 : Math.max(0, Math.min(15, v)); }

function renderIV() {
  if (!cur) return;
  const S = cur.form.s;
  const iv = [clampIV($("ivA").value), clampIV($("ivD").value), clampIV($("ivS").value)];
  let lv = Math.round((+$("lvl").value || 1) * 2) / 2; lv = Math.max(1, Math.min(51, lv));
  const cp = calcCP(S, iv, lv), hp = calcHP(S[2], iv[2], lv), pct = Math.round((iv[0] + iv[1] + iv[2]) / 45 * 100);
  const m = cpmAt(lv);
  const sp = (S[0] + iv[0]) * m * (S[1] + iv[1]) * m * Math.floor((S[2] + iv[2]) * m);
  const league = (cap) => {
    let best = null;
    for (const l of levels()) if (calcCP(S, iv, l) <= cap) best = l;
    return best ? `Lv${best} · CP ${calcCP(S, iv, best)}` : "불가";
  };
  $("ivresult").innerHTML = `
    <div class="stat"><span>CP</span><b>${cp}</b><span>개체값 ${pct}%</span></div>
    <div class="stat"><span>HP</span><b>${hp}</b><span>Lv ${lv}</span></div>
    <div class="stat"><span>실제 공/방</span><b>${((S[0] + iv[0]) * m).toFixed(1)} / ${((S[1] + iv[1]) * m).toFixed(1)}</b><span>스탯곱 ${Math.round(sp / 1000).toLocaleString()}k</span></div>
    <div class="stat"><span>슈퍼리그 (1500)</span><b style="font-size:1rem">${league(1500)}</b></div>
    <div class="stat"><span>하이퍼리그 (2500)</span><b style="font-size:1rem">${league(2500)}</b></div>`;
  $("lvtable").innerHTML = "<tr><th>레벨</th><th>CP</th><th>HP</th><th>레벨</th><th>CP</th><th>HP</th></tr>" +
    levels(1, 51).filter((l) => l % 1 === 0).reduce((acc, l, i, arr) => {
      if (i % 2) return acc;
      const cell = (x) => x ? `<td>${x}</td><td><b>${calcCP(S, iv, x)}</b></td><td>${calcHP(S[2], iv[2], x)}</td>` : "<td></td><td></td><td></td>";
      return acc + `<tr>${cell(l)}${cell(arr[i + 1])}</tr>`;
    }, "");
}

function renderFind() {
  if (!cur) return;
  const cp = +$("findCp").value, hp = +$("findHp").value, floor = +$("findFloor").value;
  const out = $("findresult");
  if (!cp) { out.innerHTML = "<p class='muted'>게임에 표시된 CP(와 HP)를 입력하면 가능한 레벨·개체값 조합을 찾아줍니다.</p>"; return; }
  const S = cur.form.s, res = [];
  for (const lv of levels())
    for (let a = floor; a <= 15; a++) for (let d = floor; d <= 15; d++) for (let s = floor; s <= 15; s++) {
      if (calcCP(S, [a, d, s], lv) !== cp) continue;
      if (hp && calcHP(S[2], s, lv) !== hp) continue;
      res.push([lv, a, d, s]);
    }
  if (!res.length) { out.innerHTML = "<p class='muted'>일치하는 조합이 없습니다. 폼이나 입력값을 확인해 주세요.</p>"; return; }
  const pcts = res.map((r) => Math.round((r[1] + r[2] + r[3]) / 45 * 100));
  const shown = res.slice(0, 200);
  out.innerHTML = `<p>가능한 조합 <b>${res.length}</b>개 · 개체값 <b>${Math.min(...pcts)}% ~ ${Math.max(...pcts)}%</b></p>
    <div class="scroll"><table><tr><th>레벨</th><th>공격</th><th>방어</th><th>체력</th><th>%</th></tr>
    ${shown.map((r) => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td><td>${Math.round((r[1] + r[2] + r[3]) / 45 * 100)}%</td></tr>`).join("")}
    </table></div>${res.length > shown.length ? `<p class="muted">상위 ${shown.length}개만 표시 (HP를 입력하면 좁혀집니다)</p>` : ""}`;
}

// ───────── 이벤트 ─────────
$("search").addEventListener("submit", (e) => {
  e.preventDefault();
  const id = findId($("q").value);
  if (id) show(id); else $("msg").textContent = "해당 포켓몬을 찾을 수 없습니다.";
});
$("prev").onclick = () => show(cur ? (cur.id > 1 ? cur.id - 1 : MAX_ID) : 1);
$("next").onclick = () => show(cur ? (cur.id < MAX_ID ? cur.id + 1 : 1) : 1);
$("form").onchange = () => { cur.form = cur.sp.forms[+$("form").value]; render(); };
$("art").onerror = function () { this.style.visibility = "hidden"; };
$("art").onload = function () { this.style.visibility = "visible"; };
for (const id of ["ivA", "ivD", "ivS", "lvl"]) $(id).addEventListener("input", renderIV);
for (const id of ["findCp", "findHp", "findFloor"]) $(id).addEventListener("input", renderFind);

const start = parseInt(location.hash.slice(1), 10);
if (DEX[start]) show(start);
