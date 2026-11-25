"use strict";
// CP 계산기 채널: "리자몽 10/10/10 30", "6 15/15/15 40", "888-2 15 15 15 레벨50"
const P = require("./pogo");

/**
 * → { q: {id, form, valid}, iv: [a,d,s], level } | { error } | null(형식이 아님)
 */
function parseCpCommand(content) {
  const t = String(content).trim().replace(/\s+/g, " ");
  const m = t.match(/^(.+?) (\d{1,2})\s*[/.,\s]\s*(\d{1,2})\s*[/.,\s]\s*(\d{1,2})(?: (?:레벨|lv|lv\.|level)?\s*(\d{1,2}(?:\.\d)?)\s*(?:레벨|lv)?)?$/i);
  if (!m) return null;
  const q = P.parseDexQuery(m[1]) || P.parseNameQuery(m[1]);
  if (!q) return null;   // 포켓몬이 아니면 대화로 보고 무시
  const iv = [m[2], m[3], m[4]].map(Number);
  if (iv.some((v) => v > 15)) return { error: "❌ 개체값은 0~15 사이로 적어 주세요. 예) `리자몽 10/10/10 30`" };
  const level = m[5] === undefined ? 40 : Number(m[5]);
  if (!(level >= 1 && level <= 51) || (level * 2) % 1 !== 0) return { error: "❌ 레벨은 1~51 사이, 0.5 단위로 적어 주세요. 예) `리자몽 10/10/10 30.5`" };
  return { q, iv, level, defaultLevel: m[5] === undefined };
}

module.exports = { parseCpCommand };
