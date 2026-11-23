"use strict";
// 친구 코드(친코) 등록 / 확인 / 수락
//  - "친코등록 1234 5678 9012" → 등록 완료 (코드는 암호화해서 봇 메시지의 버튼 ID 에 보관 → 수락 전에는 아무도 못 봄)
//  - "친코확인 닉네임"         → 그 멤버에게 "수락하시겠습니까?" (수락/거절 버튼은 등록한 본인만 누를 수 있음)
//  - 수락하면                  → "친코 : 1234 5678 9012"
const crypto = require("crypto");

/** "친코등록 1234-5678-9012" → { type:"register", code:"123456789012" } / 잘못된 코드면 { type:"register", code:null }
 *  "친코확인 닉네임" → { type:"check", query } */
function parseFriendCommand(content) {
  const t = String(content).trim();
  let m = t.match(/^친코\s*등록(?:\s+(.*))?$/s);
  if (m) {
    const digits = (m[1] || "").replace(/[\s\-_.]/g, "");
    return { type: "register", code: /^\d{12}$/.test(digits) ? digits : null };
  }
  m = t.match(/^친코\s*확인(?:\s+(.+))?$/s);
  if (m) return { type: "check", query: m[1] ? m[1].trim() : null };
  return null;
}

const formatCode = (c) => `${c.slice(0, 4)} ${c.slice(4, 8)} ${c.slice(8, 12)}`;

// 암호화 (AES-256-GCM). 키는 FRIEND_CODE_SECRET (없으면 봇 토큰에서 만듦)
const keyOf = (secret) => crypto.createHash("sha256").update("friendcode:" + secret).digest();
function encrypt(code, secret) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", keyOf(secret), iv);
  const ct = Buffer.concat([c.update(code, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64url");
}
function decrypt(enc, secret) {
  try {
    const b = Buffer.from(enc, "base64url");
    const d = crypto.createDecipheriv("aes-256-gcm", keyOf(secret), b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString("utf8");
  } catch {
    return null;   // 키가 바뀌었거나 손상됨
  }
}

// 버튼 ID: 등록 삭제 fcdel:<등록자>:<암호문> / 수락 fcacc:<등록자>:<요청자> / 거절 fcrej:<등록자>:<요청자>
function parseButtonId(id) {
  const m = String(id).match(/^fc(del|acc|rej):(\d+):(.+)$/);
  if (!m) return null;
  return m[1] === "del" ? { action: "delete", owner: m[2], enc: m[3] } : { action: m[1] === "acc" ? "accept" : "reject", owner: m[2], requester: m[3] };
}

/**
 * 채널 기록에서 userId 의 가장 최근 등록 암호문 찾기
 * messages: [{ authorId, time, buttonIds: [...] }]
 */
function findRegistration(messages, botId, userId) {
  let best = null;
  for (const m of messages) {
    if (m.authorId !== botId) continue;
    for (const id of m.buttonIds || []) {
      const b = parseButtonId(id);
      if (b && b.action === "delete" && b.owner === userId && (!best || m.time > best.time)) best = { time: m.time, enc: b.enc };
    }
  }
  return best ? best.enc : null;
}

const quiet = { parse: [], repliedUser: false };

function registerMessage(user, enc, deleted) {
  return {
    content: `✅ **${user.displayName}** 님의 친코등록이 완료되었습니다.\n` +
      (deleted ? "🔒 입력하신 코드는 다른 사람이 볼 수 없게 지웠어요." : "⚠️ 입력하신 메시지에 코드가 보여요. 직접 지우거나 봇에 '메시지 관리' 권한을 주세요.") +
      "\n다른 멤버가 `친코확인 " + user.displayName + "` 를 입력하면 수락 요청이 와요.",
    components: [{ type: 1, components: [{ type: 2, style: 4, label: "등록 삭제", custom_id: `fcdel:${user.id}:${enc}` }] }],
    allowedMentions: quiet,
  };
}

function invalidCodeMessage() {
  return { content: "❌ 친구 코드는 숫자 12자리예요. 예) `친코등록 1234 5678 9012`", allowedMentions: quiet };
}

function requestMessage(owner, requester) {
  return {
    content: `<@${owner.id}>\n📨 **${requester.displayName}** 님이 친구 코드를 요청했어요. 수락하시겠습니까?`,
    components: [{ type: 1, components: [
      { type: 2, style: 3, label: "수락", emoji: { name: "✅" }, custom_id: `fcacc:${owner.id}:${requester.id}` },
      { type: 2, style: 2, label: "거절", emoji: { name: "❌" }, custom_id: `fcrej:${owner.id}:${requester.id}` },
    ] }],
    allowedMentions: { users: [owner.id], repliedUser: false },
  };
}

function acceptedMessage(owner, requesterId, code) {
  return {
    content: `<@${requesterId}>\n✅ **${owner.displayName}** 님이 수락했어요!\n친코 : ${formatCode(code)}`,
    components: [], allowedMentions: { users: [requesterId] },
  };
}

function rejectedMessage(owner, requesterId) {
  return {
    content: `<@${requesterId}>\n❌ **${owner.displayName}** 님이 친구 코드 요청을 거절했어요.`,
    components: [], allowedMentions: { users: [requesterId] },
  };
}

module.exports = {
  parseFriendCommand, formatCode, encrypt, decrypt, parseButtonId, findRegistration,
  registerMessage, invalidCodeMessage, requestMessage, acceptedMessage, rejectedMessage,
};
