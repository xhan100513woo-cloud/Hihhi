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
      content: `<@${t.id}>\n⚔️ **${t.displayName}** 님과 배틀신청이 완료되었습니다.\n(신청자: ${author.displayName})`,
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

module.exports = { parseBattleRequest, pickMember, requestMessage };
