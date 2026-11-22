"use strict";
// 토큰 없이 명령어 정의와 결과 임베드를 검증하는 테스트
const assert = require("assert");
const commands = require("./commands");
const { dexEmbed, cpEmbed, ivEmbed } = require("./embeds");
const P = require("./pogo");

assert.strictEqual(commands.length, 3);

// 채널 도감번호 감지
for (const [txt, want] of [["25", 25], [" 6 ", 6], ["#150", 150], ["No.6", 6], ["no 6", 6], ["006", 6], ["6번", 6],
  ["1025", 1025], ["0", null], ["9999", null], ["25마리 잡았다", null], ["안녕 25", null], ["3.5", null], ["", null]])
  assert.strictEqual(P.parseDexNumber(txt), want, txt);

// 알려진 값
assert.strictEqual(P.calcCP(P.DEX[6].forms[0].s, [15, 15, 15], 40), 2889);   // 리자몽
assert.strictEqual(P.calcCP(P.DEX[150].forms[0].s, [15, 15, 15], 40), 4178); // 뮤츠
assert.strictEqual(P.findId("리자몽"), 6);
assert.strictEqual(P.findId("pikachu"), 25);
assert.ok(P.findIVs(P.DEX[6].forms[0].s, 2889, 158, 10).some((r) => r.lv === 40 && r.iv.join() === "15,15,15"));

// Discord 임베드 제한: 필드 값 1024자, 필드 25개, 전체 6000자
function checkLimits(r) {
  for (const e of r.embeds || []) {
    assert.ok((e.fields || []).length <= 25);
    let total = (e.title || "").length + (e.description || "").length;
    assert.ok((e.title || "").length <= 256, e.title);
    for (const f of e.fields || []) {
      assert.ok(f.value.length > 0 && f.value.length <= 1024, f.name);
      total += f.name.length + f.value.length;
    }
    assert.ok(total <= 6000);
  }
}
for (const id of Object.keys(P.DEX)) {
  P.DEX[id].forms.forEach((_, i) => { checkLimits(dexEmbed(id, String(i))); checkLimits(cpEmbed(id, 15, 15, 15, 40, String(i))); });
}
checkLimits(ivEmbed("6", 2889, null, 0));
assert.ok(dexEmbed("없는포켓몬").ephemeral);

console.log(JSON.stringify(dexEmbed("리자몽").embeds[0], null, 1).slice(0, 1500));
console.log(cpEmbed("뮤츠", 15, 15, 15, 40).embeds[0].fields.map((f) => f.name + ": " + f.value).join("\n"));
console.log(ivEmbed("6", 2889, 158, 0).embeds[0].description);
console.log("\n모든 테스트 통과");
