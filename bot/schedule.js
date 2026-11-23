"use strict";
// 포켓몬 GO 일정: ScrapedDuck(LeekDuck 일정 JSON)에서 받아 '현재일정' / '다음일정' 으로 보여준다.
// 데이터는 요청할 때 받아오고 15분 동안 캐시 → 일정이 바뀌면 자동으로 반영된다.
const P = require("./pogo");

const EVENTS_URL = process.env.EVENTS_URL || "https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/events.json";
const CACHE_MS = 15 * 60 * 1000;
const TZ = "Asia/Seoul";

const TYPE_KO = {
  "community-day": ["🌟", "커뮤니티 데이"], "event": ["🎉", "이벤트"], "go-battle-league": ["🏆", "GO 배틀리그"],
  "go-pass": ["🎫", "GO 패스"], "max-battles": ["🔴", "맥스 배틀"], "max-mondays": ["🔴", "맥스 먼데이"],
  "pokemon-go-tour": ["🌏", "포켓몬 GO 투어"], "pokemon-spotlight-hour": ["🔦", "스포트라이트 아워"],
  "raid-battles": ["⚔️", "레이드 배틀"], "raid-day": ["⚔️", "레이드 데이"], "raid-hour": ["⏰", "레이드 아워"],
  "research": ["📜", "리서치"], "timed-research": ["📜", "기간 한정 리서치"], "special-research": ["📜", "스페셜 리서치"],
  "season": ["🍂", "시즌"], "twitch-drops": ["📺", "트위치 드롭"], "elite-raids": ["💥", "엘리트 레이드"],
  "ticketed-event": ["🎟️", "유료 이벤트"], "live-event": ["📍", "현장 이벤트"], "city-safari": ["🏙️", "시티 사파리"],
  "pokestop-showcase": ["🏅", "포켓스톱 쇼케이스"], "team-go-rocket": ["🚀", "GO 로켓단"], "go-rocket-takeover": ["🚀", "GO 로켓단"],
  "bonus-hour": ["⏱️", "보너스 아워"], "wild-area": ["🌲", "와일드 에어리어"], "update": ["🔧", "업데이트"],
};
const typeOf = (e) => TYPE_KO[e.eventType] || ["📅", e.heading || "일정"];

/** "2026-11-25T18:00:00.000" (현지 시간 → 한국 시간으로 간주) / "...Z" (UTC) → ms */
function parseTime(s) {
  if (!s) return null;
  const t = Date.parse(/Z$|[+-]\d\d:?\d\d$/.test(s) ? s : s + "+09:00");
  return Number.isNaN(t) ? null : t;
}

const fmt = new Intl.DateTimeFormat("ko-KR", { timeZone: TZ, month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false });
function fmtTime(ms) {
  const p = Object.fromEntries(fmt.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return `${p.month}/${p.day}(${p.weekday}) ${p.hour}:${p.minute}`;
}
function fmtDuration(ms) {
  const m = Math.max(0, Math.round(ms / 60000)), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
  return d ? `${d}일 ${h}시간` : h ? `${h}시간 ${mm}분` : `${mm}분`;
}

// 이벤트 이름 속 포켓몬 영어 이름 → 한국어 (예: "Noibat Spotlight Hour" → 음뱃)
const EN = Object.entries(P.DEX).filter(([, p]) => p.en && p.en.length >= 3)
  .map(([, p]) => [new RegExp(`\\b${p.en.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"), p.ko]);
function koreanNames(name) {
  const found = [];
  for (const [re, ko] of EN) if (re.test(name) && !found.includes(ko)) found.push(ko);
  return found.slice(0, 6);
}

/** events → { current, upcoming } (now: ms) */
function classify(events, now) {
  const list = events.map((e) => ({ ...e, s: parseTime(e.start), e: parseTime(e.end) })).filter((x) => x.s !== null);
  const current = list.filter((x) => x.s <= now && (x.e === null || now < x.e)).sort((a, b) => (a.e ?? Infinity) - (b.e ?? Infinity));
  const upcoming = list.filter((x) => x.s > now).sort((a, b) => a.s - b.s);
  return { current, upcoming };
}

function field(x, now, mode) {
  const [emoji, type] = typeOf(x);
  const ko = koreanNames(x.name);
  const when = `🕒 ${fmtTime(x.s)} ~ ${x.e ? fmtTime(x.e) : "미정"}`;
  const left = mode === "current" ? (x.e ? `⏳ ${fmtDuration(x.e - now)} 남음` : "") : `🔜 ${fmtDuration(x.s - now)} 후 시작`;
  return {
    name: `${emoji} [${type}] ${x.name}`.slice(0, 256),
    value: [ko.length ? `👾 ${ko.join(", ")}` : "", when, [left, x.link ? `[자세히 보기](${x.link})` : ""].filter(Boolean).join(" · ")]
      .filter(Boolean).join("\n").slice(0, 1024),
  };
}

const MAX_FIELDS = 15;
function scheduleEmbed(events, now, mode) {
  const { current, upcoming } = classify(events, now);
  const list = mode === "current" ? current : upcoming;
  const shown = list.slice(0, MAX_FIELDS);
  const title = mode === "current" ? "📅 현재 진행 중인 포켓몬 GO 일정" : "🗓️ 다가오는 포켓몬 GO 일정";
  const embed = {
    title,
    description: (shown.length ? "" : mode === "current" ? "지금 진행 중인 일정이 없어요." : "예정된 일정이 없어요.") +
      (list.length > shown.length ? `총 ${list.length}개 중 ${mode === "current" ? "곧 끝나는" : "가까운"} ${shown.length}개` : ""),
    color: mode === "current" ? 0x2ecc71 : 0x3498db,
    fields: shown.map((x) => field(x, now, mode)),
    footer: { text: "시간은 한국 시간 · 출처: LeekDuck (ScrapedDuck) · 15분마다 갱신" },
    timestamp: new Date(now).toISOString(),
  };
  // 임베드 전체 6000자 제한
  while (JSON.stringify(embed).length > 5800 && embed.fields.length > 1) embed.fields.pop();
  return { embeds: [embed] };
}

let cache = { at: 0, events: null };
/** 일정 데이터 받기 (15분 캐시, 실패하면 이전 데이터 사용) */
async function getEvents(fetchImpl = fetch) {
  if (cache.events && Date.now() - cache.at < CACHE_MS) return cache.events;
  try {
    const res = await fetchImpl(EVENTS_URL);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error("형식 오류");
    cache = { at: Date.now(), events: data };
  } catch (e) {
    console.error("⚠️ 일정 데이터를 받지 못했습니다:", e.message);
    if (!cache.events) throw e;
  }
  return cache.events;
}

/** "현재일정" / "현재 일정" → "current", "다음일정" → "upcoming" */
function parseScheduleCommand(content) {
  const t = String(content).trim().replace(/\s+/g, "");
  if (t === "현재일정") return "current";
  if (t === "다음일정") return "upcoming";
  return null;
}

module.exports = { parseTime, classify, scheduleEmbed, getEvents, parseScheduleCommand, koreanNames, fmtTime };
