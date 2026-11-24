"use strict";
const assert = require("assert");
const B = require("./trade-cooldown");
const H = 60 * 60 * 1000, W = B.CONFIG.WARNING;

B.reset();
// 키워드 없는 글은 무시
assert.strictEqual(B.checkMessage("방", "안녕하세요", "철수", 0), null);
assert.strictEqual(B.checkMessage("방", "안녕하세요", "철수", 1000), null);
// 처음 올린 거래글은 통과, 1시간 안에 같은 글이면 경고
assert.strictEqual(B.checkMessage("방", "리자몽 ㄱㄹ 구해요", "철수", 0), null);
assert.strictEqual(B.checkMessage("방", "리자몽  ㄱㄹ 구해요!", "철수", 30 * 60 * 1000), W);
// 다시 올린 시점(30분)부터 1시간 → 89분에도 경고, 그 뒤 1시간 넘으면 통과
assert.strictEqual(B.checkMessage("방", "리자몽 ㄱㄹ 구해요", "철수", 89 * 60 * 1000), W);
assert.strictEqual(B.checkMessage("방", "리자몽 ㄱㄹ 구해요", "철수", 89 * 60 * 1000 + H), null);
// 다른 사람·다른 방·다른 글은 별개
assert.strictEqual(B.checkMessage("방", "리자몽 ㄱㄹ 구해요", "영희", 89 * 60 * 1000 + H + 1), null);
assert.strictEqual(B.checkMessage("다른방", "리자몽 ㄱㄹ 구해요", "철수", 89 * 60 * 1000 + H + 1), null);
assert.strictEqual(B.checkMessage("방", "뮤츠 판매합니다", "철수", 89 * 60 * 1000 + H + 1), null);
// 모든 키워드
for (const k of B.CONFIG.KEYWORDS) {
  B.reset();
  assert.strictEqual(B.checkMessage("방", "피카츄 " + k, "a", 0), null, k);
  assert.strictEqual(B.checkMessage("방", "피카츄 " + k, "a", H - 1), W, k);
}
// response() 가 replier.reply 를 부르는지
B.reset();
const sent = [];
const replier = { reply: (m) => sent.push(m) };
B.response("방", "ㅍㅍ 리자몽", "a", true, replier);
B.response("방", "ㅍㅍ 리자몽", "a", true, replier);
assert.deepStrictEqual(sent, [W]);
console.log("kakao trade-cooldown: all tests passed");
