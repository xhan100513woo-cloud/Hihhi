"use strict";
// 토큰 없이 명령어 정의와 결과 임베드를 검증하는 테스트
const assert = require("assert");
const commands = require("./commands");
const { dexEmbed, cpEmbed, ivEmbed } = require("./embeds");
const P = require("./pogo");

assert.strictEqual(commands.length, 4);

// 배틀 개체 순위
for (const [txt, want] of [["배틀111", 111], ["배틀 6", 6], ["배틀#150", 150], ["배틀리자몽", 6], ["배틀하자", null], ["배틀", null], ["111배틀", null]])
  assert.strictEqual((P.parseBattle(txt) || {}).id ?? null, want, txt);

// 모습 번호 (-1 기본, -2 부터 변화 모습)
const q = (t) => JSON.stringify(P.parseBattle(t) || P.parseDexQuery(t));
assert.strictEqual(q("888-1"), JSON.stringify({ id: 888, form: 1, valid: true }));
assert.strictEqual(q("배틀888-2"), JSON.stringify({ id: 888, form: 2, valid: true }));
assert.strictEqual(q("배틀자시안-2"), JSON.stringify({ id: 888, form: 2, valid: true }));
assert.strictEqual(P.parseDexQuery("888-3").valid, false);
assert.strictEqual(P.parseDexQuery("111-2").valid, false);
assert.strictEqual(P.parseDexQuery("25-0").valid, false);
for (const [id, base] of [[888, "Hero"], [889, "Hero"], [487, "Altered"], [641, "Incarnate"], [681, "Shield"], [720, "Confined"], [964, "Zero"], [718, "Complete_fifty_percent"], [555, "Standard"], [6, "Normal"]])
  assert.strictEqual(P.DEX[id].forms[0].f, base, "기본 모습 " + id);
for (const sp of Object.values(P.DEX)) {                      // 메가는 항상 맨 뒤
  const firstMega = sp.forms.findIndex((f) => f.f.startsWith("MEGA:"));
  assert.ok(firstMega === -1 || sp.forms.slice(firstMega).every((f) => f.f.startsWith("MEGA:")));
}
assert.ok(require("./embeds").dexEmbed("888", "2").embeds[0].title.startsWith("No.0888-2 자시안"));
assert.ok(require("./embeds").badForm(888).content.includes("888-2"));
assert.strictEqual(P.parseDexNumber("배틀111"), null);
{
  const ml = P.pvpRanks(P.DEX[3].forms[0].s, Infinity, 50, 10);
  assert.strictEqual(ml[0].iv.join(), "15,15,15");            // 마스터리그 1위는 15/15/15
  for (const cap of [1500, 2500]) {
    const r = P.pvpRanks(P.DEX[184].forms[0].s, cap, 50, 10);
    assert.strictEqual(r.length, 10);
    assert.ok(r.every((x) => x.cp <= cap && x.lv <= 50));     // CP 상한·레벨 상한 준수
    assert.ok(r.every((x, i) => i === 0 || r[i - 1].sp >= x.sp)); // 스탯곱 내림차순
  }
  const e = require("./embeds").battleEmbed("6").embeds[0];
  assert.strictEqual(e.fields.length, 4);
  assert.ok(e.fields[3].name.includes("메가"));
}

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
  P.DEX[id].forms.forEach((_, i) => { checkLimits(dexEmbed(id, String(i + 1))); checkLimits(cpEmbed(id, 15, 15, 15, 40, String(i + 1))); });
}
checkLimits(ivEmbed("6", 2889, null, 0));
const { battleEmbed } = require("./embeds");
for (const id of ["1", "6", "111", "150", "184", "376", "384", "1025"]) checkLimits(battleEmbed(id));
assert.ok(dexEmbed("없는포켓몬").ephemeral);

console.log(JSON.stringify(dexEmbed("리자몽").embeds[0], null, 1).slice(0, 1500));
console.log(cpEmbed("뮤츠", 15, 15, 15, 40).embeds[0].fields.map((f) => f.name + ": " + f.value).join("\n"));
console.log(ivEmbed("6", 2889, 158, 0).embeds[0].description);
console.log("\n모든 테스트 통과");
