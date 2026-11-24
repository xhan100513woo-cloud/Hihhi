/**
 * 카카오톡 거래글 쿨타임(거쿨) 경고 봇 — 메신저봇R 용 스크립트
 *
 * 같은 사람이 같은 방에 같은 거래글(ㄱㄹ, 거래, 구매, 판매, ㄱㅁ, ㅍㅁ, ㅍㅍ 포함)을
 * 1시간 안에 다시 올리면 "거쿨경고 1 드립니다." 라고 답합니다.
 *
 * 사용법: 메신저봇R 앱에서 새 봇(레거시 API)을 만들고 이 파일 내용을 통째로 붙여넣은 뒤
 *        컴파일 → 봇 켜기. 자세한 내용은 kakao/README.md 참고.
 */

var CONFIG = {
  KEYWORDS: ["ㄱㄹ", "거래", "구매", "판매", "ㄱㅁ", "ㅍㅁ", "ㅍㅍ"],
  COOLDOWN_MS: 60 * 60 * 1000,          // 1시간
  WARNING: "거쿨경고 1 드립니다.",
  ROOMS: [],                             // 비우면 모든 방. 예: ["포켓몬고 거래방"]
  PER_SENDER: true                       // true: 같은 사람이 올린 같은 글만 / false: 누가 올렸든 같은 글
};

// key -> 마지막으로 올라온 시각(ms)
var lastPosted = {};

function hasTradeKeyword(text) {
  for (var i = 0; i < CONFIG.KEYWORDS.length; i++) {
    if (text.indexOf(CONFIG.KEYWORDS[i]) !== -1) return true;
  }
  return false;
}

// 띄어쓰기·줄바꿈·이모티콘 정도 차이는 같은 글로 봄
function normalize(text) {
  return String(text).replace(/[\s​]+/g, "").replace(/[!?.~,·…\-_=+*#@^]+/g, "").toLowerCase();
}

function cleanup(now) {
  for (var k in lastPosted) {
    if (now - lastPosted[k] >= CONFIG.COOLDOWN_MS) delete lastPosted[k];
  }
}

/** 경고 메시지(문자열) 또는 null 을 돌려줌. now 는 테스트용. */
function checkMessage(room, msg, sender, now) {
  if (now === undefined) now = Date.now();
  if (!msg || !hasTradeKeyword(msg)) return null;
  if (CONFIG.ROOMS.length && CONFIG.ROOMS.indexOf(room) === -1) return null;

  var body = normalize(msg);
  if (!body) return null;
  var key = room + "\u0000" + (CONFIG.PER_SENDER ? sender : "") + "\u0000" + body;

  cleanup(now);
  var prev = lastPosted[key];
  lastPosted[key] = now; // 다시 올린 시점부터 1시간 다시 계산
  if (prev !== undefined && now - prev < CONFIG.COOLDOWN_MS) return CONFIG.WARNING;
  return null;
}

// 메신저봇R 레거시 API 진입점
function response(room, msg, sender, isGroupChat, replier, imageDB, packageName) {
  var warn = checkMessage(room, msg, sender);
  if (warn) replier.reply(warn);
}

// Node 테스트용 (메신저봇R 에서는 무시됨)
if (typeof module !== "undefined" && module.exports) {
  module.exports = { checkMessage: checkMessage, response: response, CONFIG: CONFIG,
    reset: function () { lastPosted = {}; } };
}
