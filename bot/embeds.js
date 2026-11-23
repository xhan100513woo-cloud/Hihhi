"use strict";
// 명령어 결과를 Discord 임베드(JSON) 로 만드는 순수 함수들 — 토큰 없이 테스트 가능
const P = require("./pogo");

const ART = (id) => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
const tname = (t) => `${P.TYPES[t][1]} ${P.TYPES[t][0]}`;
const fmtMult = (m) => "×" + (Math.round(m * 1000) / 1000);
const H = [15, 15, 15];

function resolve(query, form) {
  const id = P.findId(query);
  if (!id) return { error: `❌ \`${query}\` 에 해당하는 포켓몬을 찾을 수 없습니다. (1~${P.MAX_ID} 또는 이름)` };
  const sp = P.DEX[id];
  const f = P.pickForm(sp, form);
  return { id, sp, f };
}

function title(id, sp, f) {
  const formTxt = f.f === "Normal" ? "" : ` [${P.formLabel(f.f)}]`;
  return `No.${String(id).padStart(4, "0")} ${sp.ko} (${sp.en})${formTxt}`;
}

function err(msg) { return { content: msg, ephemeral: true }; }

/** /도감 */
function dexEmbed(query, form) {
  const r = resolve(query, form);
  if (r.error) return err(r.error);
  const { id, sp, f } = r, S = f.s;

  const def = P.defenseGroups(f.t);
  const weak = def.filter((g) => g.mult > 1).map((g) => `**${fmtMult(g.mult)}** ${g.types.map(tname).join(", ")}`).join("\n") || "없음";
  const resist = def.filter((g) => g.mult < 1).map((g) => `**${fmtMult(g.mult)}** ${g.types.map(tname).join(", ")}`).join("\n") || "없음";
  const strong = f.t.map((t) => `${tname(t)} 기술 → ${P.CHART[t][0].map(tname).join(", ") || "없음"}`).join("\n");

  const rng = (lv, fl) => `${P.calcCP(S, [fl, fl, fl], lv)}~**${P.calcCP(S, H, lv)}**`;
  const forms = sp.forms.length > 1 ? sp.forms.map((x, i) => `\`${i}\` ${P.formLabel(x.f)}`).join(" · ") : null;

  const fields = [
    { name: "타입", value: f.t.map(tname).join(" / "), inline: true },
    { name: "능력치 (공/방/체)", value: `${S[0]} / ${S[1]} / ${S[2]}`, inline: true },
    { name: "GO 출시", value: sp.r ? "✅ 출시" : "❌ 미출시", inline: true },
    { name: "최대 CP (100%)", value: `Lv40 **${P.calcCP(S, H, 40)}**\nLv50 **${P.calcCP(S, H, 50)}**\nLv51 **${P.calcCP(S, H, 51)}**`, inline: true },
    { name: "상황별 CP (최소~100%)", value: `리서치 Lv15: ${rng(15, 10)}\n레이드·알 Lv20: ${rng(20, 10)}\n날씨부스트 Lv25: ${rng(25, 10)}`, inline: true },
    { name: "🔻 약점 속성 (받는 피해)", value: weak },
    { name: "🛡️ 저항 속성", value: resist },
    { name: "⚔️ 강점 속성 (자속 기술 ×1.6)", value: strong },
  ];
  // 개체값별 CP 표
  const ivRows = [[15, 15, 15], [15, 15, 14], [15, 14, 15], [14, 14, 14], [13, 13, 13], [12, 12, 12], [10, 10, 10]];
  const ivTable = "개체값     %   Lv20  Lv25  Lv40  Lv50\n" + ivRows.map((iv) => {
    const pct = Math.round((iv[0] + iv[1] + iv[2]) / 45 * 100);
    return `${iv.map((v) => String(v).padStart(2)).join("/")}  ${String(pct).padStart(3)}  ` +
      [20, 25, 40, 50].map((l) => String(P.calcCP(S, iv, l)).padStart(5)).join(" ");
  }).join("\n");
  fields.push({ name: "📊 개체값별 CP", value: "```\n" + ivTable + "\n```" });
  if (forms) fields.push({ name: "다른 폼 (`폼` 옵션에 번호 입력)", value: forms.slice(0, 1024) });

  return {
    embeds: [{
      title: title(id, sp, f),
      color: P.TYPE_COLOR[f.t[0]],
      thumbnail: { url: ART(id) },
      fields,
      footer: { text: "데이터: pogoapi.net, PokeAPI" },
    }],
  };
}

/** /cp */
function cpEmbed(query, a, d, s, lv, form) {
  const r = resolve(query, form);
  if (r.error) return err(r.error);
  const { id, sp, f } = r, S = f.s, iv = [a, d, s];
  lv = Math.max(1, Math.min(51, Math.round(lv * 2) / 2));
  const m = P.cpmAt(lv);
  const pct = Math.round((a + d + s) / 45 * 100);
  const lg = (cap) => { const l = P.bestLeagueLevel(S, iv, cap); return l ? `Lv${l} · CP ${P.calcCP(S, iv, l)}` : "불가"; };
  const table = [15, 20, 25, 30, 35, 40, 45, 50, 51]
    .map((l) => `Lv${String(l).padEnd(2)}  CP ${String(P.calcCP(S, iv, l)).padStart(5)}  HP ${P.calcHP(S[2], s, l)}`).join("\n");
  return {
    embeds: [{
      title: title(id, sp, f),
      description: `개체값 **${a}/${d}/${s}** (${pct}%) · 레벨 **${lv}**`,
      color: P.TYPE_COLOR[f.t[0]],
      thumbnail: { url: ART(id) },
      fields: [
        { name: "CP", value: `**${P.calcCP(S, iv, lv)}**`, inline: true },
        { name: "HP", value: `**${P.calcHP(S[2], s, lv)}**`, inline: true },
        { name: "실제 공/방", value: `${((S[0] + a) * m).toFixed(1)} / ${((S[1] + d) * m).toFixed(1)}`, inline: true },
        { name: "슈퍼리그 (1500)", value: lg(1500), inline: true },
        { name: "하이퍼리그 (2500)", value: lg(2500), inline: true },
        { name: "레벨별 CP", value: "```\n" + table + "\n```" },
      ],
    }],
  };
}

/** /개체 */
function ivEmbed(query, cp, hp, floor, form) {
  const r = resolve(query, form);
  if (r.error) return err(r.error);
  const { id, sp, f } = r;
  const res = P.findIVs(f.s, cp, hp || 0, floor || 0);
  const base = { title: title(id, sp, f), color: P.TYPE_COLOR[f.t[0]], thumbnail: { url: ART(id) } };
  if (!res.length)
    return { embeds: [{ ...base, description: `CP ${cp}${hp ? ` / HP ${hp}` : ""} 에 맞는 조합이 없습니다. 폼이나 입력값을 확인해 주세요.` }] };
  const pcts = res.map((x) => x.pct);
  const top = [...res].sort((x, y) => y.pct - x.pct).slice(0, 15);
  const lines = top.map((x) => `Lv${String(x.lv).padEnd(4)} ${x.iv.map((v) => String(v).padStart(2)).join("/")}  ${String(x.pct).padStart(3)}%`).join("\n");
  return {
    embeds: [{
      ...base,
      description: `CP **${cp}**${hp ? ` · HP **${hp}**` : ""} · 최소 개체값 ${floor || 0}\n` +
        `가능한 조합 **${res.length}**개 · 개체값 **${Math.min(...pcts)}% ~ ${Math.max(...pcts)}%**`,
      fields: [{ name: `개체값 높은 순 ${top.length}개 (레벨 공/방/체)`, value: "```\n" + lines + "\n```" }],
      footer: { text: res.length > 15 ? "HP를 입력하면 후보가 줄어듭니다" : "데이터: pogoapi.net" },
    }],
  };
}

/** 배틀 개체 순위 (슈퍼 / 하이퍼 / 마스터 / 메가마스터 각 10위) */
const PVP_MAX_LV = 50;
function battleEmbed(query, form) {
  const r = resolve(query, form);
  if (r.error) return err(r.error);
  const { id, sp, f } = r;
  const table = (rows) => rows.length
    ? "```\n순위 개체      레벨  CP     %\n" + rows.map((x) =>
      `${String(x.rank).padStart(2)}  ${x.iv.map((v) => String(v).padStart(2)).join("/")}  ${String(x.lv).padStart(4)} ${String(x.cp).padStart(5)} ${x.pct.toFixed(1).padStart(5)}`
    ).join("\n") + "\n```"
    : "참가 불가 (최저 CP가 상한을 넘습니다)";
  const base = f.f.startsWith("MEGA:") ? sp.forms[0] : f;
  const mega = f.f.startsWith("MEGA:") ? f : sp.forms.find((x) => x.f.startsWith("MEGA:"));
  const fields = [
    { name: "🔵 슈퍼리그 (CP 1500)", value: table(P.pvpRanks(base.s, 1500, PVP_MAX_LV)) },
    { name: "🟡 하이퍼리그 (CP 2500)", value: table(P.pvpRanks(base.s, 2500, PVP_MAX_LV)) },
    { name: "🟣 마스터리그 (CP 제한 없음)", value: table(P.pvpRanks(base.s, Infinity, PVP_MAX_LV)) },
    { name: `🔴 메가마스터리그${mega ? ` (${P.formLabel(mega.f)})` : ""}`,
      value: mega ? table(P.pvpRanks(mega.s, Infinity, PVP_MAX_LV)) : "메가진화가 없는 포켓몬입니다" },
  ];
  return {
    embeds: [{
      title: title(id, sp, base) + " · 배틀 개체 순위",
      description: `최대 레벨 ${PVP_MAX_LV} 기준 · 스탯곱(공×방×HP) 순 · %는 1위 대비`,
      color: P.TYPE_COLOR[base.t[0]],
      thumbnail: { url: ART(id) },
      fields,
      footer: { text: "개체 표기: 공격/방어/체력" },
    }],
  };
}

module.exports = { dexEmbed, cpEmbed, ivEmbed, battleEmbed };
