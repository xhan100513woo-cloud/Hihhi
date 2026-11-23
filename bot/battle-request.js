"use strict";
// 배틀신청: "배틀신청 닉네임" → 상대를 찾아 멘션하고 "닉네임 님과 배틀신청이 완료되었습니다." 로 답한다

/** "배틀신청 닉네임", "배틀 신청 닉네임", "배틀신청 @멘션" → 닉네임 부분 (없으면 null) */
function parseBattleRequest(content) {
  const m = String(content).trim().match(/^배틀\s*신청\s+(.+)$/s);
  return m ? m[1].trim() : null;
}

const norm = (s) => String(s || "").trim().toLowerCase();

/**
 * 검색된 멤버 후보 중에서 상대 고르기.
 * members: [{ id, displayName, username, bot }]
 * 반환: { member } | { error: "notfound" | "ambiguous" | "self" | "bot", candidates }
 */
function pickMember(members, query, authorId) {
  const q = norm(query).replace(/^@/, "");
  const people = members.filter((m) => !m.bot);
  const exact = people.filter((m) => norm(m.displayName) === q || norm(m.username) === q);
  const partial = people.filter((m) => norm(m.displayName).includes(q) || norm(m.username).includes(q));
  const list = exact.length ? exact : partial;
  if (!list.length) {
    if (members.some((m) => m.bot && (norm(m.displayName) === q || norm(m.username) === q))) return { error: "bot" };
    return { error: "notfound" };
  }
  if (list.length > 1) return { error: "ambiguous", candidates: list.slice(0, 5) };
  if (list[0].id === authorId) return { error: "self" };
  return { member: list[0] };
}

/** 결과 메시지 (멘션은 상대만 알림이 가도록 allowedMentions 로 제한) */
function requestMessage(result, query, author) {
  if (result.member) {
    const t = result.member;
    return {
      content: `<@${t.id}>\n⚔️ **${t.displayName}** 님과 배틀신청이 완료되었습니다.\n(신청자: <@${author.id}>)`,
      allowedMentions: { users: [t.id], repliedUser: false },
    };
  }
  const msg = {
    notfound: `❌ '${query}' 닉네임을 이 서버에서 찾을 수 없어요. 닉네임을 다시 확인하거나 \`배틀신청 @닉네임\` 처럼 멘션으로 적어 주세요.`,
    ambiguous: `❓ '${query}' 와 비슷한 사람이 여러 명이에요: ${(result.candidates || []).map((m) => m.displayName).join(", ")}\n` +
      "정확한 닉네임이나 `배틀신청 @닉네임` 으로 적어 주세요.",
    self: "😅 자기 자신에게는 배틀신청을 할 수 없어요.",
    bot: "🤖 봇에게는 배틀신청을 할 수 없어요.",
  }[result.error];
  return { content: msg, allowedMentions: { parse: [], repliedUser: false } };
}

/**
 * 배틀신청 명령 해석
 *  "배틀신청 확인"          → { type: "check" }
 *  "배틀신청 수락 [닉네임]"  → { type: "accept", query: 닉네임 | null }
 *  "배틀신청 닉네임"         → { type: "request", query }
 */
function parseBattleCommand(content) {
  const rest = parseBattleRequest(content);
  if (rest === null) return null;
  if (/^확인$/.test(rest)) return { type: "check" };
  const a = rest.match(/^수락(?:\s+(.+))?$/s);
  if (a) return { type: "accept", query: a[1] ? a[1].trim() : null };
  return { type: "request", query: rest };
}

// 봇이 보낸 메시지에서 신청/수락 기록을 읽어 낸다 (별도 저장소 없이 채널 기록이 곧 데이터)
const REQ_RE = /^<@!?(\d+)>\n⚔️ .* 님과 배틀신청이 완료되었습니다\.\n\(신청자: <@!?(\d+)>\)/;
const ACC_RE = /^<@!?(\d+)>\n✅ .* 배틀신청을 수락했습니다!\n\(수락: <@!?(\d+)>\)/;

/**
 * messages: [{ authorId, content, time }] (순서 무관), botId: 봇 사용자 ID
 * 반환: 오래된 순 [{ challenger, target, time, accepted }]
 */
function buildRequests(messages, botId) {
  const list = [];
  for (const m of [...messages].sort((a, b) => a.time - b.time)) {
    if (m.authorId !== botId) continue;
    let r = m.content.match(REQ_RE);
    if (r) { list.push({ target: r[1], challenger: r[2], time: m.time, accepted: false }); continue; }
    r = m.content.match(ACC_RE);
    if (r) {
      const [, challenger, target] = r;
      for (let i = list.length - 1; i >= 0; i--)
        if (list[i].challenger === challenger && list[i].target === target && !list[i].accepted) { list[i].accepted = true; break; }
    }
  }
  return list;
}

/** 나(userId)에게 온 대기 중 신청 중 가장 최근 것 (challengerId 가 있으면 그 사람 것만) */
function findPending(requests, userId, challengerId) {
  for (let i = requests.length - 1; i >= 0; i--) {
    const r = requests[i];
    if (r.target === userId && !r.accepted && (!challengerId || r.challenger === challengerId)) return r;
  }
  return null;
}

const ts = (ms) => `<t:${Math.floor(ms / 1000)}:R>`;

/** "배틀신청 확인" 결과 */
function checkMessage(requests, userId) {
  const got = requests.filter((r) => r.target === userId).reverse().slice(0, 10);
  const sent = requests.filter((r) => r.challenger === userId).reverse().slice(0, 10);
  const st = (r) => (r.accepted ? "✅ 수락됨" : "⏳ 대기 중");
  const lines = ["📋 **배틀신청 확인** (최근 기록)", "", "**📥 받은 신청**"];
  lines.push(...(got.length ? got.map((r) => `· <@${r.challenger}> 님 → 나  ${st(r)}  ${ts(r.time)}`) : ["없음"]));
  lines.push("", "**📤 보낸 신청**");
  lines.push(...(sent.length ? sent.map((r) => `· 나 → <@${r.target}> 님  ${st(r)}  ${ts(r.time)}`) : ["없음"]));
  if (got.some((r) => !r.accepted)) lines.push("", "수락하려면 `배틀신청 수락 닉네임` (또는 `배틀신청 수락` 으로 가장 최근 신청 수락)");
  return { content: lines.join("\n"), allowedMentions: { parse: [], repliedUser: false } };
}

/** 수락 메시지 (신청자에게만 알림) */
function acceptMessage(request, accepter) {
  return {
    content: `<@${request.challenger}>\n✅ **${accepter.displayName}** 님이 배틀신청을 수락했습니다!\n(수락: <@${accepter.id}>)`,
    allowedMentions: { users: [request.challenger], repliedUser: false },
  };
}

module.exports = { parseBattleRequest, parseBattleCommand, pickMember, requestMessage, buildRequests, findPending, checkMessage, acceptMessage };
