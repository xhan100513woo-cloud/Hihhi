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

// 속성 아이콘 파일 18개 + 커스텀 이모지 치환
{
  const fs = require("fs"), path = require("path");
  for (const t of Object.keys(P.TYPES)) assert.ok(fs.existsSync(path.join(__dirname, "type-icons", t.toLowerCase() + ".png")), t);
  const before = P.TYPES.Fire[1];
  P.setTypeEmojis({ Fire: "<:pogo_fire:123>" });
  assert.ok(require("./embeds").dexEmbed("6").embeds[0].fields[0].value.includes("<:pogo_fire:123> 불꽃"));
  P.setTypeEmojis({ Fire: before });
}

// 배틀신청
{
  const BR = require("./battle-request");
  assert.strictEqual(BR.parseBattleRequest("배틀신청 피카츄짱"), "피카츄짱");
  assert.strictEqual(BR.parseBattleRequest("배틀 신청  홍길동 "), "홍길동");
  assert.strictEqual(BR.parseBattleRequest("배틀신청"), null);
  assert.strictEqual(BR.parseBattleRequest("배틀111"), null);
  assert.strictEqual(P.parseBattle("배틀신청 홍길동"), null);   // 배틀 개체 명령과 겹치지 않음
  const ms = [
    { id: "1", displayName: "홍길동", username: "hong", bot: false },
    { id: "2", displayName: "홍길순", username: "hong2", bot: false },
    { id: "3", displayName: "철수", username: "chulsoo", bot: false },
    { id: "9", displayName: "도감봇", username: "dexbot", bot: true },
  ];
  assert.strictEqual(BR.pickMember(ms, "홍길동", "3").member.id, "1");   // 정확히 일치 우선
  assert.strictEqual(BR.pickMember(ms, "CHULSOO", "1").member.id, "3");  // 아이디·대소문자
  assert.strictEqual(BR.pickMember(ms, "홍길", "3").error, "ambiguous");
  assert.strictEqual(BR.pickMember(ms, "영희", "3").error, "notfound");
  assert.strictEqual(BR.pickMember(ms, "철수", "3").error, "self");
  assert.strictEqual(BR.pickMember(ms, "도감봇", "3").error, "bot");
  const ok = BR.requestMessage(BR.pickMember(ms, "홍길동", "3"), "홍길동", { id: "3", displayName: "철수" });
  assert.ok(ok.content.startsWith("<@1>") && ok.content.includes("**홍길동** 님과 배틀신청이 완료되었습니다."));
  assert.deepStrictEqual(ok.allowedMentions.users, ["1"]);

  // 명령 해석
  assert.deepStrictEqual(BR.parseBattleCommand("배틀신청 확인"), { type: "check" });
  assert.deepStrictEqual(BR.parseBattleCommand("배틀신청 수락"), { type: "accept", query: null });
  assert.deepStrictEqual(BR.parseBattleCommand("배틀신청 수락 홍길동"), { type: "accept", query: "홍길동" });
  assert.deepStrictEqual(BR.parseBattleCommand("배틀신청 홍길동"), { type: "request", query: "홍길동" });
  assert.strictEqual(BR.parseBattleCommand("배틀111"), null);

  // 왕복: 봇이 보낸 신청 메시지 → 기록 읽기 → 수락 메시지 → 수락 반영
  const BOT = "9", hist = [];
  const post = (m, t) => hist.push({ authorId: BOT, content: m.content, time: t });
  post(ok, 1000);                                                                  // 철수(3) → 홍길동(1)
  post(BR.requestMessage({ member: ms[2] }, "철수", { id: "2", displayName: "홍길순" }), 2000); // 홍길순(2) → 철수(3)
  hist.push({ authorId: "3", content: ok.content, time: 1500 });                   // 사람이 같은 글을 써도 무시
  let reqs = BR.buildRequests(hist, BOT);
  assert.strictEqual(reqs.length, 2);
  assert.deepStrictEqual([reqs[0].challenger, reqs[0].target, reqs[0].accepted], ["3", "1", false]);
  const pend = BR.findPending(reqs, "1", null);
  assert.ok(pend && pend.challenger === "3");
  assert.strictEqual(BR.findPending(reqs, "1", "2"), null);                       // 홍길순에게 받은 건 없음
  const acc = BR.acceptMessage(pend, { id: "1", displayName: "홍길동" });
  assert.ok(acc.content.startsWith("<@3>") && acc.content.includes("**홍길동** 님이 배틀신청을 수락했습니다!"));
  assert.deepStrictEqual(acc.allowedMentions.users, ["3"]);                         // 신청자에게만 알림
  post(acc, 3000);
  reqs = BR.buildRequests(hist, BOT);
  assert.strictEqual(reqs[0].accepted, true);
  assert.strictEqual(BR.findPending(reqs, "1", null), null);
  const chk = BR.checkMessage(reqs, "3").content;                                  // 철수 입장
  assert.ok(chk.includes("나 → <@1> 님  ✅ 수락됨") && chk.includes("<@2> 님 → 나  ⏳ 대기 중"));
  assert.deepStrictEqual(BR.checkMessage(reqs, "3").allowedMentions.parse, []);    // 확인은 아무도 알림 안 감

  // 배틀 종료
  assert.deepStrictEqual(BR.parseBattleCommand("배틀 종료"), { type: "end", query: null });
  assert.deepStrictEqual(BR.parseBattleCommand("배틀종료 홍길동"), { type: "end", query: "홍길동" });
  assert.strictEqual(P.parseBattle("배틀종료"), null);                              // 배틀 개체 명령과 겹치지 않음
  // 철수(3)가 홍길동(1)과의 배틀만 종료 → 홍길순(2) 신청은 남음
  assert.strictEqual(BR.countEnding(reqs, "3", "1"), 1);
  const end1 = BR.endMessage({ id: "3", displayName: "철수" }, { id: "1", displayName: "홍길동" }, 1);
  assert.ok(end1.content.startsWith("<@1>") && end1.content.includes("배틀이 종료되었습니다"));
  assert.deepStrictEqual(end1.allowedMentions.users, ["1"]);
  post(end1, 4000);
  reqs = BR.buildRequests(hist, BOT);
  assert.deepStrictEqual(reqs.map((r) => r.challenger + ">" + r.target), ["2>3"]);
  // 철수(3)가 전체 종료 → 모두 지워짐, 아무에게도 알림 없음
  const end2 = BR.endMessage({ id: "3", displayName: "철수" }, null, BR.countEnding(reqs, "3", null));
  assert.deepStrictEqual(end2.allowedMentions.users, []);
  post(end2, 5000);
  reqs = BR.buildRequests(hist, BOT);
  assert.strictEqual(reqs.length, 0);
  assert.ok(BR.checkMessage(reqs, "3").content.includes("없음"));
  assert.ok(BR.endMessage({ id: "3", displayName: "철수" }, null, 0).content.startsWith("❌"));
  // 종료 후 새 신청은 다시 보임
  post(ok, 6000);
  assert.strictEqual(BR.buildRequests(hist, BOT).length, 1);
}

// 채널별 기능 분리
{
  const { routeMessage } = require("./router");
  const cfg = { dex: ["포켓몬개체정보방"], pvp: ["배틀개체정보방"], battle: ["배틀신청"] };
  const R = (name, text) => { const r = routeMessage({ name, id: "1" }, text, cfg); return r ? r.kind : null; };
  // 포켓몬개체정보방: 도감번호만
  assert.strictEqual(R("포켓몬개체정보방", "111"), "dex");
  assert.strictEqual(R("💬｜포켓몬개체정보방", "888-2"), "dex");
  assert.strictEqual(R("포켓몬개체정보방", "배틀111"), null);
  assert.strictEqual(R("포켓몬개체정보방", "배틀신청 홍길동"), null);
  // 배틀개체정보방: 배틀 도감번호만
  assert.strictEqual(R("배틀개체정보방", "배틀111"), "pvp");
  assert.strictEqual(R("배틀개체정보방", "111"), null);
  assert.strictEqual(R("배틀개체정보방", "배틀신청 홍길동"), null);
  // 배틀신청방: 배틀신청만
  assert.strictEqual(R("배틀신청방", "배틀신청 홍길동"), "battleCmd");
  assert.strictEqual(R("배틀신청방", "배틀 종료"), "battleCmd");
  assert.strictEqual(R("배틀신청방", "111"), null);
  assert.strictEqual(R("배틀신청방", "배틀111"), null);
  // 그 외 채널: 반응 없음
  for (const t of ["111", "배틀111", "배틀신청 홍길동"]) assert.strictEqual(R("일반", t), null);
  // "*" 이면 모든 채널
  assert.strictEqual(routeMessage({ name: "아무거나", id: "1" }, "111", { dex: ["*"], pvp: [], battle: [] }).kind, "dex");
}

// 감지 채널 이름 매칭
const ch = (name, id = "1") => ({ name, id });
assert.ok(P.channelMatches(ch("일반"), ["일반"]));
assert.ok(P.channelMatches(ch("💬｜일반"), ["일반"]));
assert.ok(P.channelMatches(ch("일반-채팅"), ["일반"]));
assert.ok(P.channelMatches(ch("general"), ["일반", "General"]));
assert.ok(P.channelMatches(ch("아무거나", "999"), ["999"]));
assert.ok(P.channelMatches(ch("아무거나"), ["*"]));
assert.ok(!P.channelMatches(ch("공지"), ["일반"]));
assert.ok(!P.channelMatches(ch("공지"), [""]));

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
  const both = require("./embeds").battleEmbed("111").embeds;
  assert.strictEqual(both.length, 2);                          // 일반 + 그림자
  assert.strictEqual(both[1].fields.length, 3);                // 그림자는 메가마스터 없음
  // 그림자 순위 개체는 일반과 같아야 함
  const ivs = (f) => f.value.split("\n").filter((l) => /^ ?\d+  /.test(l)).map((l) => l.trim().split(/\s+/)[1]);
  for (let i = 0; i < 3; i++) assert.deepStrictEqual(ivs(both[1].fields[i]), ivs(both[0].fields[i]));
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
  let msgTotal = 0;
  for (const e of r.embeds || []) msgTotal += JSON.stringify(e).length;
  assert.ok(msgTotal <= 6000, "메시지 전체 임베드 6000자 이하");
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
