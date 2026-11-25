"use strict";
// 토큰 없이 명령어 정의와 결과 임베드를 검증하는 테스트
const assert = require("assert");
const commands = require("./commands");
const { dexEmbed, cpEmbed, ivEmbed } = require("./embeds");
const P = require("./pogo");

assert.strictEqual(commands.length, 6);

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
  assert.strictEqual(R("포켓몬개체정보방", "리자몽"), "dex");
  assert.strictEqual(R("포켓몬개체정보방", "자시안-2"), "dex");
  assert.strictEqual(R("포켓몬개체정보방", "리자몽 잡았다"), null);         // 대화는 무시
  assert.strictEqual(R("배틀개체정보방", "리자몽"), null);                   // 배틀방은 '배틀' 붙여야
  assert.strictEqual(R("배틀신청방", "리자몽"), null);
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

// 획득 경로
{
  const A = require("./acquire");
  const lines = (id) => A.acquireLines(id).join("\n");
  assert.ok(lines(172).includes("알 부화") && !lines(172).includes("야생 출현"));     // 피츄: 베이비
  assert.ok(lines(150).includes("전설") && lines(150).includes("레이드 전용"));     // 뮤츠
  assert.ok(lines(151).includes("환상") && lines(151).includes("리서치 전용"));     // 뮤
  assert.ok(lines(132).includes("변장") && !lines(132).includes("야생 출현"));      // 메타몽
  assert.ok(lines(1).includes("야생 출현") && lines(1).includes("맑음"));           // 이상해씨 + 날씨
  assert.ok(lines(83).includes("지역 한정"));                                       // 파오리
  assert.ok(!lines(25).includes("드물"));                                            // 피카츄: 베이비에서 진화 → 흔함
  assert.ok(lines(887).includes("드물"));                                            // 드래펄트: 진화형
  assert.strictEqual(A.condText({ candy: 25, lure: "Mossy Lure Module" }), "사탕 25개 · 이끼 루어");
  assert.strictEqual(A.condText({ candy: 25, buddyKm: 10, day: true }), "사탕 25개 · 파트너로 10km 걷기 · 낮에만");
  const evo = A.acquireEmbed(133).embeds[0].fields.find((f) => f.name.includes("다음 진화")).value;
  assert.ok(evo.includes("리피아") && evo.includes("이끼 루어") && evo.includes("블래키") && evo.includes("밤에만"));
  const { routeMessage } = require("./router");
  const cfg = { dex: ["포켓몬개체정보방"], pvp: ["배틀개체정보방"], battle: ["배틀신청"], acq: ["포켓몬획득정보"] };
  assert.strictEqual(routeMessage({ name: "포켓몬획득정보방", id: "1" }, "111", cfg).kind, "acq");
  assert.strictEqual(routeMessage({ name: "포켓몬획득정보방", id: "1" }, "리자몽", cfg).kind, "acq");
  assert.strictEqual(routeMessage({ name: "포켓몬획득정보방", id: "1" }, "배틀111", cfg), null);
  assert.strictEqual(routeMessage({ name: "포켓몬개체정보방", id: "1" }, "111", cfg).kind, "dex");   // 개체정보방은 그대로
}

// 새 멤버 환영 메시지
{
  const W = require("./welcome");
  const m = W.welcomeMessage({ id: "42" });
  assert.ok(m.content.startsWith("<@42> 안녕하세요~ 공지 지켜가며 활동해주세요~"));
  assert.ok(m.content.includes("3. 거ㄹㅐ는 불가능 합니다.") && m.content.includes("친코등록 : 친코등록 12자리코드"));
  assert.ok(m.content.endsWith("도감번호-2하면 폼체인지 모습이 나옵니다"));
  assert.ok(m.content.length <= 2000, "디스코드 메시지 2000자 제한");
  assert.deepStrictEqual(m.allowedMentions.users, ["42"]);
  assert.ok(P.channelMatches({ name: "📢공지방", id: "1" }, ["공지"]));
  const g = W.greetMessage({ id: "42" });
  assert.strictEqual(g.content, "<@42> 어서오세요~ 공지방가서 공지한번만 읽어주세요~ 봇사용법 나와있습니다~");
  assert.deepStrictEqual(g.allowedMentions.users, ["42"]);
}

// CP 계산기 채널
{
  const { parseCpCommand } = require("./cpcalc");
  const r = parseCpCommand("리자몽 10/10/10 30");
  assert.deepStrictEqual([r.q.id, r.iv, r.level], [6, [10, 10, 10], 30]);
  assert.strictEqual(require("./embeds").cpEmbed("6", 10, 10, 10, 30).embeds[0].fields[0].value, "**2362**");   // 공식으로 직접 확인한 값
  assert.deepStrictEqual(parseCpCommand("888-2 15 15 15 레벨50").q, { id: 888, form: 2, valid: true });
  assert.strictEqual(parseCpCommand("뮤츠 15/14/15").level, 40);                       // 레벨 생략 → 40
  assert.strictEqual(parseCpCommand("리자몽 10/10/10 30.5").level, 30.5);
  assert.ok(parseCpCommand("피카츄 16/1/1 30").error && parseCpCommand("리자몽 1/1/1 52").error);
  for (const t of ["안녕 10/10/10 30", "오늘 3/4 만나", "리자몽 잡았다"]) assert.strictEqual(parseCpCommand(t), null, t);
  const { routeMessage } = require("./router");
  assert.strictEqual(routeMessage({ name: "cp계산기", id: "1" }, "리자몽 10/10/10 30", { dex: [], pvp: [], battle: [], cp: ["cp계산기"] }).kind, "cp");
  assert.strictEqual(routeMessage({ name: "CP계산기", id: "1" }, "6 15/15/15 40", { dex: [], pvp: [], battle: [], cp: ["cp계산기"] }).kind, "cp");
  assert.strictEqual(routeMessage({ name: "포켓몬개체정보방", id: "1" }, "리자몽 10/10/10 30", { dex: ["포켓몬개체정보방"], pvp: [], battle: [], cp: ["cp계산기"] }), null);
}

// 포켓몬 교환
{
  const TR = require("./trade");
  const isP = (x) => !!P.parseNameQuery(x);
  assert.deepStrictEqual(TR.parseTradeCommand("교환 레쿠쟈 암멍이", isP), { type: "register", give: "레쿠쟈", want: "암멍이" });
  assert.deepStrictEqual(TR.parseTradeCommand("교환 홍길동", isP), { type: "lookup", query: "홍길동" });
  assert.deepStrictEqual(TR.parseTradeCommand("교환목록"), { type: "list" });
  assert.deepStrictEqual(TR.parseTradeCommand("교환 목록"), { type: "list" });
  assert.deepStrictEqual(TR.parseTradeCommand("완료목록"), { type: "doneList" });
  assert.deepStrictEqual(TR.parseTradeCommand("교환완료"), { type: "confirm", query: null });
  assert.deepStrictEqual(TR.parseTradeCommand("교환신청 홍길동 레쿠쟈"), { type: "request", member: "홍길동", pokemon: "레쿠쟈" });
  assert.deepStrictEqual(TR.parseTradeCommand("교환신청 홍 길동 레쿠쟈"), { type: "request", member: "홍 길동", pokemon: "레쿠쟈" });
  assert.deepStrictEqual(TR.parseTradeCommand("교환취소 레쿠쟈"), { type: "cancel", pokemon: "레쿠쟈" });
  assert.deepStrictEqual(TR.parseTradeCommand("교환 이로치 레쿠쟈 암멍이", isP), { type: "register", give: "이로치", want: "레쿠쟈 암멍이" });
  assert.strictEqual(TR.parseTradeCommand("안녕"), null);
  assert.strictEqual(TR.parseTradeCommand("교환 <@1> **x**", isP).give, "1");                  // 멘션·서식 문자 제거

  // 왕복: 등록 → 목록 → 신청 → 수락 → 한 명만 완료(미완료) → 둘 다 완료 → 완료목록
  const BOT = "9", A = { id: "1", displayName: "철수" }, B = { id: "2", displayName: "영희" };
  const hist = []; let t = 0;
  const post = (id, m) => hist.push({ id, authorId: BOT, content: m.content, time: ++t });
  post("100", TR.registerMessage(A, "레쿠쟈", "암멍이"));
  post("101", TR.registerMessage(A, "뮤츠", "뮤"));
  hist.push({ id: "102", authorId: "2", content: TR.registerMessage(B, "가짜", "가짜").content, time: ++t });   // 사람이 쓴 건 무시
  let st = TR.buildTradeState(hist, BOT);
  assert.strictEqual(TR.openOffers(st).length, 2);
  assert.ok(TR.listMessage(st).content.includes("**레쿠쟈** 줌 → **암멍이** 받음"));
  assert.ok(TR.memberListMessage(st, A).content.includes("뮤츠"));
  assert.strictEqual(TR.findOffer(st, "1", "레쿠쟈").id, "100");
  assert.strictEqual(TR.findOffer(st, "1", null), null);                                        // 등록이 2개면 포켓몬 지정 필요
  const req = TR.requestMessage(TR.findOffer(st, "1", "레쿠쟈"), A.id, B);
  assert.ok(req.content.startsWith("<@1>") && req.content.includes("교환을 수락하시겠습니까?"));
  assert.deepStrictEqual(TR.parseButtonId(req.components[0].components[0].custom_id), { action: "accept", offerId: "100", owner: "1", requester: "2" });
  const acc = TR.acceptedMessage("200", st.offers.get("100"), A, B.id);
  assert.ok(acc.content.includes("교환을 진행해주세요."));
  post("200", acc);
  st = TR.buildTradeState(hist, BOT);
  assert.strictEqual(TR.activeTrades(st, "2").length, 1);
  post("201", TR.confirmMessage(st.trades.get("200"), A, false));                                  // 철수만 완료
  st = TR.buildTradeState(hist, BOT);
  assert.ok(TR.doneListMessage(st).content.includes("아직"));                                        // 한 명만 → 완료목록에 없음
  assert.strictEqual(TR.openOffers(st).length, 2);
  const last = TR.confirmMessage(st.trades.get("200"), B, true);
  assert.ok(last.content.includes("🎉 교환 완료!"));
  post("202", last);
  st = TR.buildTradeState(hist, BOT);
  assert.ok(st.trades.get("200").done);
  assert.ok(TR.doneListMessage(st).content.includes("<@1> **레쿠쟈** ↔ <@2> **암멍이**"));
  assert.deepStrictEqual(TR.openOffers(st).map((o) => o.id), ["101"]);                           // 완료된 등록은 목록에서 빠짐
  assert.strictEqual(TR.activeTrades(st, "2").length, 0);
  // 취소
  post("203", TR.cancelMessage(st.offers.get("101")));
  st = TR.buildTradeState(hist, BOT);
  assert.strictEqual(TR.openOffers(st).length, 0);
  assert.ok(TR.listMessage(st).content.includes("등록된 교환이 없어요"));
  // 라우팅
  const { routeMessage } = require("./router");
  const cfg = { dex: ["포켓몬개체정보방"], pvp: [], battle: [], trade: ["교환"] };
  assert.strictEqual(routeMessage({ name: "교환", id: "1" }, "교환 레쿠쟈 암멍이", cfg).kind, "trade");
  assert.strictEqual(routeMessage({ name: "포켓몬개체정보방", id: "1" }, "교환목록", cfg), null);
}

// 친구 코드
{
  const FC = require("./friendcode");
  assert.deepStrictEqual(FC.parseFriendCommand("친코등록 1234 5678 9012"), { type: "register", code: "123456789012" });
  assert.deepStrictEqual(FC.parseFriendCommand("친코 등록 1234-5678-9012"), { type: "register", code: "123456789012" });
  assert.deepStrictEqual(FC.parseFriendCommand("친코등록 1234"), { type: "register", code: null });
  assert.deepStrictEqual(FC.parseFriendCommand("친코등록"), { type: "register", code: null });
  assert.deepStrictEqual(FC.parseFriendCommand("친코확인 홍길동"), { type: "check", query: "홍길동" });
  assert.deepStrictEqual(FC.parseFriendCommand("친코확인"), { type: "check", query: null });
  assert.strictEqual(FC.parseFriendCommand("안녕"), null);
  assert.strictEqual(FC.formatCode("123456789012"), "1234 5678 9012");
  // 암호화: 같은 키로만 풀리고, 결과에 코드가 그대로 보이지 않음
  const enc = FC.encrypt("123456789012", "secret-a");
  assert.strictEqual(FC.decrypt(enc, "secret-a"), "123456789012");
  assert.strictEqual(FC.decrypt(enc, "secret-b"), null);
  assert.ok(!enc.includes("123456789012"));
  // 버튼 ID 100자 제한 (디스코드 사용자 ID 최대 20자리)
  const owner = { id: "12345678901234567890", displayName: "홍길동" }, req = { id: "98765432109876543210", displayName: "철수" };
  const reg = FC.registerMessage(owner, enc, true);
  const delId = reg.components[0].components[0].custom_id;
  assert.ok(delId.length <= 100, "custom_id " + delId.length);
  assert.ok(!reg.content.includes("1234"));                                         // 등록 메시지에 코드 노출 없음
  assert.deepStrictEqual(FC.parseButtonId(delId), { action: "delete", owner: owner.id, enc });
  // 채널 기록에서 최신 등록 찾기 (봇 메시지만, 가장 최근 것)
  const BOT = "1";
  const enc2 = FC.encrypt("999988887777", "secret-a");
  const hist = [
    { authorId: BOT, time: 1, buttonIds: [delId] },
    { authorId: BOT, time: 3, buttonIds: [FC.registerMessage(owner, enc2, true).components[0].components[0].custom_id] },
    { authorId: "2", time: 5, buttonIds: [`fcdel:${owner.id}:${FC.encrypt("000000000000", "secret-a")}`] },   // 사람이 만든 건 무시
  ];
  assert.strictEqual(FC.decrypt(FC.findRegistration(hist, BOT, owner.id), "secret-a"), "999988887777");
  assert.strictEqual(FC.findRegistration(hist, BOT, req.id), null);
  // 요청 → 수락 (등록자만 알림 → 수락 후 요청자에게 코드)
  const rq = FC.requestMessage(owner, req);
  assert.ok(rq.content.includes("수락하시겠습니까?") && rq.content.startsWith(`<@${owner.id}>`));
  assert.deepStrictEqual(rq.allowedMentions.users, [owner.id]);
  const [acc, rej] = rq.components[0].components.map((c) => FC.parseButtonId(c.custom_id));
  assert.deepStrictEqual(acc, { action: "accept", owner: owner.id, requester: req.id });
  assert.strictEqual(rej.action, "reject");
  const done = FC.acceptedMessage(owner, req.id, "999988887777");
  assert.ok(done.content.includes("친코 : 9999 8888 7777") && done.components.length === 0);
  assert.deepStrictEqual(done.allowedMentions.users, [req.id]);
  // 채널 라우팅
  const { routeMessage } = require("./router");
  const cfg = { dex: ["포켓몬개체정보방"], pvp: [], battle: [], friend: ["친코등록"] };
  assert.strictEqual(routeMessage({ name: "친코등록", id: "1" }, "친코등록 123456789012", cfg).kind, "friend");
  assert.strictEqual(routeMessage({ name: "친코등록방", id: "1" }, "친코확인 홍길동", cfg).kind, "friend");
  assert.strictEqual(routeMessage({ name: "포켓몬개체정보방", id: "1" }, "친코등록 123456789012", cfg), null);
}

// 내 위치
(async () => {
  const L = require("./location");
  assert.ok(L.isLocationCommand("내위치") && L.isLocationCommand(" 내 위치 ") && !L.isLocationCommand("내위치 알려줘"));
  assert.deepStrictEqual(L.cleanCoords("37.5665351", "126.9779692", "20.4"), { lat: 37.566535, lng: 126.977969, acc: 20 });
  assert.strictEqual(L.cleanCoords(91, 0), null);
  assert.strictEqual(L.cleanCoords("abc", 0), null);
  // 토큰: 1회용, 10분 만료
  const t = L.createToken({ userId: "1", displayName: "홍길동", channelId: "9" }, 1000);
  assert.ok(L.peekToken(t, 1000 + L.TOKEN_TTL_MS - 1));
  assert.strictEqual(L.peekToken(t, 1000 + L.TOKEN_TTL_MS + 1), null);
  // 채널 메시지: 좌표·정확도·지도, 멘션 알림 없음
  const pm = L.postMessage({ displayName: "홍길동" }, { lat: 37.566535, lng: 126.977969, acc: 20 });
  assert.ok(pm.content.includes("`37.566535, 126.977969`") && pm.content.includes("정확도 약 20m") && pm.content.includes("google.com/maps"));
  assert.deepStrictEqual(pm.allowedMentions.parse, []);
  assert.ok(!L.pageHtml("x", { displayName: "<script>" }).includes("<b><script>"));   // 이름 HTML 이스케이프
  // 실제 서버
  const posted = [];
  const server = L.startServer(0, async (info, c) => posted.push([info.channelId, c]));
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const tok = L.createToken({ userId: "1", displayName: "홍길동", channelId: "9" });
  const page = await (await fetch(`${base}/loc?t=${tok}`)).text();
  assert.ok(page.includes("홍길동") && page.includes("내 위치 가져오기"));
  assert.ok((await (await fetch(`${base}/loc?t=bad`)).text()).includes("만료"));
  const post = (body) => fetch(`${base}/api/loc`, { method: "POST", body: JSON.stringify(body) });
  assert.strictEqual((await post({ t: tok, lat: 999, lng: 0 })).status, 400);              // 잘못된 좌표 (토큰은 그대로)
  const ok = await post({ t: tok, lat: 37.5665351, lng: 126.9779692, acc: 12 });
  assert.strictEqual(ok.status, 200);
  assert.deepStrictEqual(posted, [["9", { lat: 37.566535, lng: 126.977969, acc: 12 }]]);
  assert.strictEqual((await post({ t: tok, lat: 1, lng: 1 })).status, 410);               // 1회용
  server.close();
  // 채널 라우팅
  const { routeMessage } = require("./router");
  assert.deepStrictEqual(routeMessage({ name: "내위치", id: "1" }, "내위치", { dex: [], pvp: [], battle: [], location: ["내위치"] }), { kind: "location" });
  assert.strictEqual(routeMessage({ name: "포켓몬개체정보방", id: "1" }, "내위치", { dex: ["포켓몬개체정보방"], pvp: [], battle: [], location: ["내위치"] }), null);
  // 도시 핵심 장소
  const CITY = require("./cities");
  assert.ok(CITY.CITIES.length >= 50);
  for (const c of CITY.CITIES) {
    assert.ok(c.places.length >= 3, "장소 부족 " + c.ko);
    for (const p of c.places) assert.ok(L.cleanCoords(p.lat, p.lng), p.name);
    const e = CITY.cityEmbed(c).embeds[0];
    assert.ok(e.description.length <= 4096 && e.title.length <= 256);
  }
  const ny = CITY.findCity("뉴욕");
  assert.ok(ny && ny.en.includes("New York") && CITY.findCity("NYC") === ny && CITY.findCity("new york") === ny);
  assert.ok(ny.places.some((p) => p.name.includes("자유의 여신상")));
  assert.ok(CITY.findCity("서울") && CITY.findCity("도쿄") && CITY.findCity("파리"));
  assert.strictEqual(CITY.findCity("뉴욕 가고싶다"), null);
  assert.ok(CITY.cityEmbed(ny).embeds[0].description.startsWith("**1. "));
  assert.strictEqual(routeMessage({ name: "내위치", id: "1" }, "뉴욕", { dex: [], pvp: [], battle: [], location: ["내위치"] }).kind, "city");
  assert.strictEqual(routeMessage({ name: "내위치", id: "1" }, "도시목록", { dex: [], pvp: [], battle: [], location: ["내위치"] }).kind, "cityList");
  assert.ok(CITY.cityListMessage().content.length <= 2000);
  console.log("위치 테스트 통과");
})().catch((e) => { console.error(e); process.exit(1); });

// 포켓몬 GO 일정
(async () => {
  const S = require("./schedule");
  // 현지 시간(Z 없음)은 한국 시간, Z 는 UTC
  assert.strictEqual(S.parseTime("2026-11-25T18:00:00.000"), Date.parse("2026-11-25T09:00:00Z"));
  assert.strictEqual(S.parseTime("2026-11-24T21:00:00.000Z"), Date.parse("2026-11-24T21:00:00Z"));
  assert.strictEqual(S.parseTime(null), null);
  assert.strictEqual(S.fmtTime(Date.parse("2026-11-25T09:00:00Z")), "11/25(수) 18:00");
  assert.strictEqual(S.parseScheduleCommand("현재일정"), "current");
  assert.strictEqual(S.parseScheduleCommand(" 다음 일정 "), "upcoming");
  assert.strictEqual(S.parseScheduleCommand("현재일정 알려줘"), null);
  assert.deepStrictEqual(S.koreanNames("Noibat Spotlight Hour"), ["음뱃"]);
  const now = Date.parse("2026-11-23T11:00:00Z");      // 한국 11/23 20:00
  const ev = [
    { name: "Ended", eventType: "event", start: "2026-11-20T10:00:00.000", end: "2026-11-22T20:00:00.000" },
    { name: "Dynamax Espurr during Max Monday", eventType: "max-mondays", start: "2026-11-23T06:00:00.000", end: "2026-11-23T21:00:00.000", link: "https://x" },
    { name: "Long Season", eventType: "season", start: "2026-09-08T10:00:00.000", end: "2026-12-01T10:00:00.000" },
    { name: "Noibat Spotlight Hour", eventType: "pokemon-spotlight-hour", start: "2026-11-26T18:00:00.000", end: "2026-11-26T19:00:00.000" },
    { name: "GBL", eventType: "go-battle-league", start: "2026-11-24T21:00:00.000Z", end: "2026-12-01T21:00:00.000Z" },
    { name: "No date", eventType: "max-battles", start: null, end: null },
  ];
  const { current, upcoming } = S.classify(ev, now);
  assert.deepStrictEqual(current.map((x) => x.name), ["Dynamax Espurr during Max Monday", "Long Season"]);   // 곧 끝나는 순
  assert.deepStrictEqual(upcoming.map((x) => x.name), ["GBL", "Noibat Spotlight Hour"]);                   // 가까운 순
  const cur = S.scheduleEmbed(ev, now, "current").embeds[0];
  assert.ok(cur.fields[0].name.includes("[맥스 먼데이]") && cur.fields[0].value.includes("냐스퍼") && cur.fields[0].value.includes("1시간 0분 남음"));
  const up = S.scheduleEmbed(ev, now, "upcoming").embeds[0];
  assert.ok(up.fields[0].value.includes("11/25(수) 06:00"));                                                // UTC → 한국 시간
  assert.ok(S.scheduleEmbed([], now, "current").embeds[0].description.includes("없어요"));
  const many = Array.from({ length: 40 }, (_, i) => ({ name: "Event " + i + " " + "x".repeat(200), eventType: "event", start: "2026-12-01T10:00:00.000", end: "2026-12-02T10:00:00.000", link: "https://leekduck.com/" + "y".repeat(100) }));
  const big = S.scheduleEmbed(many, now, "upcoming").embeds[0];
  assert.ok(big.fields.length <= 15 && JSON.stringify(big).length <= 6000 && big.description.includes("총 40개"));
  // 채널 라우팅
  const { routeMessage } = require("./router");
  const cfg = { dex: ["포켓몬개체정보방"], pvp: [], battle: [], schedule: ["포켓몬고일정"] };
  assert.deepStrictEqual(routeMessage({ name: "포켓몬고일정", id: "1" }, "현재일정", cfg), { kind: "schedule", mode: "current" });
  assert.strictEqual(routeMessage({ name: "포켓몬개체정보방", id: "1" }, "현재일정", cfg), null);
  assert.strictEqual(routeMessage({ name: "포켓몬고일정", id: "1" }, "111", cfg), null);
  // 받기 실패 시 이전 데이터 사용, 처음부터 실패하면 오류
  await assert.rejects(S.getEvents(async () => { throw new Error("down"); }));
  const got = await S.getEvents(async () => ({ ok: true, json: async () => ev }));
  assert.strictEqual(got.length, ev.length);
  console.log("일정 테스트 통과");
})().catch((e) => { console.error(e); process.exit(1); });

// 이름만으로 조회
assert.deepStrictEqual(P.parseNameQuery("리자몽"), { id: 6, form: null, valid: true });
assert.deepStrictEqual(P.parseNameQuery(" Charizard "), { id: 6, form: null, valid: true });
assert.deepStrictEqual(P.parseNameQuery("자시안-2"), { id: 888, form: 2, valid: true });
assert.deepStrictEqual(P.parseNameQuery("자시안 - 3").valid, false);
assert.strictEqual(P.parseNameQuery("리자"), null);                              // 부분 이름은 무시
assert.strictEqual(P.parseNameQuery("안녕하세요"), null);
assert.strictEqual(P.parseNameQuery("Mr. Mime").id, 122);
for (const [id, p] of Object.entries(P.DEX)) assert.strictEqual(P.parseNameQuery(p.ko).id, +id, p.ko); // 모든 한국어 이름

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
for (const id of Object.keys(P.DEX)) checkLimits(require("./acquire").acquireEmbed(+id));      // 모든 포켓몬 획득 경로
assert.ok(dexEmbed("없는포켓몬").ephemeral);

console.log(JSON.stringify(dexEmbed("리자몽").embeds[0], null, 1).slice(0, 1500));
console.log(cpEmbed("뮤츠", 15, 15, 15, 40).embeds[0].fields.map((f) => f.name + ": " + f.value).join("\n"));
console.log(ivEmbed("6", 2889, 158, 0).embeds[0].description);
console.log("\n모든 테스트 통과");
