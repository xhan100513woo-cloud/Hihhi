"use strict";
// /채널꾸미기 : 서버 채널을 포켓몬 테마(이름·설명·카테고리)로 정리
// 채널 이름에 봇이 알아보는 단어(포켓몬개체정보방 등)를 그대로 남겨서 기능은 그대로 동작한다.
const P = require("./pogo");

// list: index.js 의 채널 목록 이름 (DEX, ACQ ...) — 기존 채널을 찾을 때 그 목록으로 매칭
const LAYOUT = [
  { category: "🏥 포켓몬센터", key: "포켓몬센터", channels: [
    { list: "NOTICE", name: "📢｜공지방", topic: "트레이너 수칙과 봇 사용법" },
    { list: "GREET", name: "💬｜메인정보방", topic: "포켓몬센터 로비 · 자유롭게 이야기해요" },
  ] },
  { category: "🔬 오박사 연구소", key: "오박사연구소", channels: [
    { list: "DEX", name: "📕｜포켓몬개체정보방", topic: "도감 열람 · 도감번호나 이름 (예: 25, 리자몽, 888-2)" },
    { list: "ACQ", name: "🗺️｜포켓몬획득정보방", topic: "서식지 조사 · 어디서 잡을 수 있을까? (예: 133, 피츄)" },
    { list: "CP", name: "🧮｜cp계산기", topic: "성장 측정기 · 리자몽 10/10/10 30" },
    { list: "SCHEDULE", name: "📅｜포켓몬고일정", topic: "이벤트 달력 · 현재일정 / 다음일정" },
  ] },
  { category: "🏟️ 포켓몬 체육관", key: "포켓몬체육관", channels: [
    { list: "PVP", name: "🥇｜배틀개체정보방", topic: "리그 분석실 · 배틀111 → 슈퍼·하이퍼·마스터 순위" },
    { list: "BATTLE", name: "⚔️｜배틀신청", topic: "도전장 · 배틀신청 닉네임 → 배틀신청 수락 → 배틀신청 확인 → 배틀 종료" },
  ] },
  { category: "🎒 트레이너 광장", key: "트레이너광장", channels: [
    { list: "TRADE", name: "🔁｜교환", topic: "교환 센터 · 교환 레쿠쟈 암멍이 / 교환목록 / 교환신청 닉네임 포켓몬" },
    { list: "FRIEND", name: "🤝｜친코등록", topic: "친구 코드 · 친코등록 1234 5678 9012 / 친코확인 닉네임" },
    { list: "LOCATION", name: "📍｜내위치", topic: "타운맵 · 내위치 / 뉴욕, 서울 같은 도시 이름" },
  ] },
];

const norm = (s) => String(s || "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

/**
 * 계획 세우기 (디스코드에 아무것도 하지 않음)
 * channels: [{ id, name, type: "text"|"category", parentId }]
 * lists: { DEX: [...], ... }  (index.js 의 채널 목록)
 * → { categories: [{ name, key, existingId|null }], edits: [{ id, from, name, topic, categoryKey, position }], missing: [{ name, topic, categoryKey, position }] }
 */
function planDecoration(channels, lists, createMissing = false) {
  const cats = channels.filter((c) => c.type === "category");
  const texts = channels.filter((c) => c.type === "text");
  const used = new Set();
  const plan = { categories: [], edits: [], missing: [] };
  for (const group of LAYOUT) {
    const cat = cats.find((c) => norm(c.name).includes(norm(group.key)));
    plan.categories.push({ name: group.category, key: group.key, existingId: cat ? cat.id : null });
    group.channels.forEach((ch, position) => {
      const list = lists[ch.list] || [];
      const found = texts.find((c) => !used.has(c.id) && list.length && P.channelMatches(c, list));
      if (found) {
        used.add(found.id);
        plan.edits.push({ id: found.id, from: found.name, name: ch.name, topic: ch.topic, categoryKey: group.key, position });
      } else {
        plan.missing.push({ name: ch.name, topic: ch.topic, categoryKey: group.key, position, create: createMissing });
      }
    });
  }
  return plan;
}

/** 결과 보고 (본인에게만 보이는 메시지) */
function reportMessage(plan, errors = []) {
  const lines = ["🎨 **채널 꾸미기 결과**"];
  const newCats = plan.categories.filter((c) => !c.existingId).map((c) => c.name);
  if (newCats.length) lines.push(`📁 새 카테고리: ${newCats.join(", ")}`);
  if (plan.edits.length) lines.push(`✏️ 바꾼 채널 ${plan.edits.length}개:`, ...plan.edits.map((e) => `· #${e.from} → #${e.name}`));
  const created = plan.missing.filter((m) => m.create), skipped = plan.missing.filter((m) => !m.create);
  if (created.length) lines.push(`➕ 새로 만든 채널: ${created.map((m) => "#" + m.name).join(", ")}`);
  if (skipped.length) lines.push(`⚠️ 서버에 없어서 건너뜀: ${skipped.map((m) => m.name).join(", ")}`,
    "   → 만들려면 `/채널꾸미기 없는채널만들기:True`");
  if (errors.length) lines.push("❌ 실패:", ...errors.map((e) => "· " + e), "   → 봇 역할에 **채널 관리** 권한이 있는지, 봇 역할이 충분히 위에 있는지 확인해 주세요.");
  if (!errors.length) lines.push("✅ 완료! 봇 기능은 그대로 동작해요.");
  return lines.join("\n").slice(0, 2000);
}

module.exports = { LAYOUT, planDecoration, reportMessage };
