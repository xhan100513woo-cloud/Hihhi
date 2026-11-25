"use strict";
// 포켓몬 교환 게시판 (#교환 채널)
//  교환 레쿠쟈 암멍이      → 레쿠쟈를 주고 암멍이를 받는 교환 등록
//  교환 닉네임             → 그 멤버의 교환 목록
//  교환목록                → 진행 중인 모든 교환
//  교환신청 닉네임 레쿠쟈  → 등록자 멘션 + "교환을 수락하시겠습니까?" [수락/거절] (등록자만)
//  수락                    → "교환을 진행해주세요."
//  교환완료 [닉네임]       → 두 사람 모두 입력해야 완료
//  완료목록                → 완료된 교환
//  교환취소 [포켓몬]       → 내 등록 취소
// 별도 저장소 없이 봇이 채널에 남긴 메시지를 읽어 상태를 계산한다.

const clean = (s) => String(s || "").replace(/[*`<>@|\\_~]/g, "").trim().slice(0, 30);
const key = (s) => String(s || "").toLowerCase().replace(/\s+/g, "");

/** 명령 해석. isPokemon(text) 로 포켓몬 이름인지 확인 (여러 단어일 때 나누는 데 사용) */
function parseTradeCommand(content, isPokemon = () => false) {
  const t = String(content).trim().replace(/\s+/g, " ");
  if (/^교환 ?목록$/.test(t)) return { type: "list" };
  if (/^완료 ?목록$/.test(t)) return { type: "doneList" };
  let m = t.match(/^교환 ?완료(?: (.+))?$/);
  if (m) return { type: "confirm", query: m[1] || null };
  m = t.match(/^교환 ?취소(?: (.+))?$/);
  if (m) return { type: "cancel", pokemon: m[1] ? clean(m[1]) : null };
  m = t.match(/^교환 ?신청 (.+)$/);
  if (m) {
    const parts = m[1].split(" ");
    if (parts.length === 1) return { type: "request", member: parts[0], pokemon: null };
    return { type: "request", member: parts.slice(0, -1).join(" "), pokemon: clean(parts[parts.length - 1]) };
  }
  m = t.match(/^교환 (.+)$/);
  if (!m) return null;
  const parts = m[1].split(" ");
  if (parts.length === 1) return { type: "lookup", query: parts[0] };
  if (parts.length === 2) return { type: "register", give: clean(parts[0]), want: clean(parts[1]) };
  // 세 단어 이상: 양쪽 모두 포켓몬 이름이 되는 위치에서 나눔, 없으면 첫 단어 / 나머지
  for (let i = 1; i < parts.length; i++) {
    const a = parts.slice(0, i).join(" "), b = parts.slice(i).join(" ");
    if (isPokemon(a) && isPokemon(b)) return { type: "register", give: clean(a), want: clean(b) };
  }
  return { type: "register", give: clean(parts[0]), want: clean(parts.slice(1).join(" ")) };
}

// ── 봇 메시지 형식 (상태 기록) ──
const OFFER_RE = /^📦 \*\*.*\*\* 님의 교환 등록\n주는 포켓몬: \*\*(.+?)\*\*\n받고 싶은 포켓몬: \*\*(.+?)\*\*\n\(등록자: <@!?(\d+)>\)/;
const TRADE_RE = /\(교환 #(\d+) · 등록 #(\d+) · <@!?(\d+)> ↔ <@!?(\d+)>\)/;
const CONFIRM_RE = /^✔️ .*교환완료 확인 \(교환 #(\d+) · <@!?(\d+)>\)/;
const CANCEL_RE = /^🗑️ 교환 등록 취소 \(등록 #(\d+) · <@!?(\d+)>\)/;
const quiet = { parse: [], repliedUser: false };

/**
 * messages: [{ id, authorId, content, time }] → { offers: Map, trades: Map }
 *  offer: { id, owner, give, want, time, status: "open"|"done"|"cancelled" }
 *  trade: { id, offerId, owner, requester, give, want, time, confirms: Set, done }
 */
function buildTradeState(messages, botId) {
  const offers = new Map(), trades = new Map();
  for (const m of [...messages].sort((a, b) => a.time - b.time)) {
    if (m.authorId !== botId) continue;
    let r = m.content.match(OFFER_RE);
    if (r) { offers.set(m.id, { id: m.id, give: r[1], want: r[2], owner: r[3], time: m.time, status: "open" }); continue; }
    r = m.content.match(TRADE_RE);
    if (r && m.content.includes("교환을 진행해주세요")) {
      const offer = offers.get(r[2]);
      trades.set(r[1], { id: r[1], offerId: r[2], owner: r[3], requester: r[4], give: offer?.give ?? "?", want: offer?.want ?? "?",
        time: m.time, confirms: new Set(), done: false, doneTime: null });
      continue;
    }
    r = m.content.match(CONFIRM_RE);
    if (r) {
      const t = trades.get(r[1]);
      if (t && (r[2] === t.owner || r[2] === t.requester)) {
        t.confirms.add(r[2]);
        if (t.confirms.has(t.owner) && t.confirms.has(t.requester) && !t.done) {
          t.done = true; t.doneTime = m.time;
          const o = offers.get(t.offerId);
          if (o) o.status = "done";
        }
      }
      continue;
    }
    r = m.content.match(CANCEL_RE);
    if (r) { const o = offers.get(r[1]); if (o && o.owner === r[2] && o.status === "open") o.status = "cancelled"; }
  }
  return { offers, trades };
}

const openOffers = (st) => [...st.offers.values()].filter((o) => o.status === "open");
const activeTrades = (st, userId) => [...st.trades.values()].filter((t) => !t.done && (t.owner === userId || t.requester === userId));
const findOffer = (st, ownerId, pokemon) => {
  const mine = openOffers(st).filter((o) => o.owner === ownerId);
  if (!pokemon) return mine.length === 1 ? mine[0] : null;
  return mine.filter((o) => key(o.give) === key(pokemon)).pop() || null;
};

// ── 메시지 ──
function registerMessage(user, give, want) {
  return { content: `📦 **${user.displayName}** 님의 교환 등록\n주는 포켓몬: **${give}**\n받고 싶은 포켓몬: **${want}**\n(등록자: <@${user.id}>)\n` +
    `원하는 분은 \`교환신청 ${user.displayName} ${give}\` 를 입력하세요.`, allowedMentions: quiet };
}

function offerLines(list) {
  return list.map((o, i) => `${i + 1}. <@${o.owner}> : **${o.give}** 줌 → **${o.want}** 받음`).join("\n");
}

function listMessage(st) {
  const list = openOffers(st).reverse().slice(0, 25);
  return { content: list.length ? `📋 **교환목록** (${openOffers(st).length}건)\n${offerLines(list)}` : "📋 등록된 교환이 없어요. `교환 주는포켓몬 받는포켓몬` 으로 등록해 보세요.",
    allowedMentions: quiet };
}

function memberListMessage(st, member) {
  const list = openOffers(st).filter((o) => o.owner === member.id).reverse();
  return { content: list.length ? `📋 **${member.displayName}** 님의 교환 목록\n${offerLines(list)}` : `📋 **${member.displayName}** 님이 등록한 교환이 없어요.`,
    allowedMentions: quiet };
}

/** 포켓몬 이름으로 교환 찾기 (주는/받는 쪽 어느 쪽이든) */
function pokemonListMessage(st, pokemon) {
  const list = openOffers(st).filter((o) => key(o.give) === key(pokemon) || key(o.want) === key(pokemon)).reverse();
  return list.length ? { content: `📋 **${pokemon}** 관련 교환\n${offerLines(list)}`, allowedMentions: quiet } : null;
}

function doneListMessage(st) {
  const list = [...st.trades.values()].filter((t) => t.done).sort((a, b) => b.doneTime - a.doneTime).slice(0, 20);
  return { content: list.length
    ? `🎉 **완료목록** (${[...st.trades.values()].filter((t) => t.done).length}건)\n` +
      list.map((t, i) => `${i + 1}. <@${t.owner}> **${t.give}** ↔ <@${t.requester}> **${t.want}** · <t:${Math.floor(t.doneTime / 1000)}:R>`).join("\n")
    : "🎉 아직 완료된 교환이 없어요.", allowedMentions: quiet };
}

function requestMessage(offer, ownerId, requester) {
  return {
    content: `<@${ownerId}>\n🔁 **${requester.displayName}** 님이 교환을 신청했어요.\n**${offer.give}** ↔ **${offer.want}**\n교환을 수락하시겠습니까?`,
    components: [{ type: 1, components: [
      { type: 2, style: 3, label: "수락", emoji: { name: "✅" }, custom_id: `tracc:${offer.id}:${ownerId}:${requester.id}` },
      { type: 2, style: 2, label: "거절", emoji: { name: "❌" }, custom_id: `trrej:${offer.id}:${ownerId}:${requester.id}` },
    ] }],
    allowedMentions: { users: [ownerId], repliedUser: false },
  };
}

function parseButtonId(id) {
  const m = String(id).match(/^tr(acc|rej):(\d+):(\d+):(\d+)$/);
  return m ? { action: m[1] === "acc" ? "accept" : "reject", offerId: m[2], owner: m[3], requester: m[4] } : null;
}

/** 수락 → 같은 메시지를 이 내용으로 바꿈 (tradeId = 그 메시지 ID) */
function acceptedMessage(tradeId, offer, owner, requesterId) {
  return {
    content: `<@${requesterId}>\n✅ **${owner.displayName}** 님이 수락했어요. 교환을 진행해주세요.\n**${offer.give}** ↔ **${offer.want}**\n` +
      `교환이 끝나면 두 분 모두 \`교환완료\` 를 입력해 주세요.\n(교환 #${tradeId} · 등록 #${offer.id} · <@${offer.owner}> ↔ <@${requesterId}>)`,
    components: [], allowedMentions: { users: [requesterId] },
  };
}

function rejectedMessage(owner, requesterId) {
  return { content: `<@${requesterId}>\n❌ **${owner.displayName}** 님이 교환 신청을 거절했어요.`, components: [], allowedMentions: { users: [requesterId] } };
}

/** 교환완료 확인 메시지 (+ 두 사람 모두면 완료 축하) */
function confirmMessage(trade, user, nowDone) {
  const other = user.id === trade.owner ? trade.requester : trade.owner;
  let content = `✔️ **${user.displayName}** 님 교환완료 확인 (교환 #${trade.id} · <@${user.id}>)`;
  if (nowDone) content += `\n🎉 교환 완료! <@${trade.owner}> **${trade.give}** ↔ <@${trade.requester}> **${trade.want}**`;
  else content += `\n<@${other}> 님도 \`교환완료\` 를 입력하면 완료돼요.`;
  return { content, allowedMentions: { users: nowDone ? [] : [other], repliedUser: false } };
}

function cancelMessage(offer) {
  return { content: `🗑️ 교환 등록 취소 (등록 #${offer.id} · <@${offer.owner}>)\n**${offer.give}** → **${offer.want}**`, allowedMentions: quiet };
}

const info = (text) => ({ content: text, allowedMentions: quiet });

module.exports = {
  parseTradeCommand, buildTradeState, openOffers, activeTrades, findOffer, parseButtonId,
  registerMessage, listMessage, memberListMessage, pokemonListMessage, doneListMessage,
  requestMessage, acceptedMessage, rejectedMessage, confirmMessage, cancelMessage, info,
};
