"use strict";
// 포켓몬 GO 도감 디스코드 봇
const { Client, Events, GatewayIntentBits, MessageFlags } = require("discord.js");
const commands = require("./commands");
const { dexEmbed, cpEmbed, ivEmbed, battleEmbed, badForm } = require("./embeds");
const P = require("./pogo");

try { process.loadEnvFile(require("path").join(__dirname, ".env")); } catch { /* .env 없으면 환경변수 사용 */ }

/** 붙여 넣을 때 섞이기 쉬운 공백·줄바꿈·따옴표·"Bot " 접두어 제거 */
const clean = (v) => String(v || "").trim().replace(/^["'`]+|["'`]+$/g, "").replace(/^Bot\s+/i, "").trim();
const DISCORD_TOKEN = clean(process.env.DISCORD_TOKEN);
// 친구 코드 암호화 키 (없으면 봇 토큰 사용 → 토큰을 바꾸면 기존 등록은 다시 해야 함)
const FRIEND_SECRET = clean(process.env.FRIEND_CODE_SECRET) || DISCORD_TOKEN;
const GUILD_ID = clean(process.env.GUILD_ID);
// 도감번호를 감지할 채널 (쉼표로 여러 개). 채널 ID 또는 이름 모두 가능
const channelList = (v, def) => (v || def).split(",").map((s) => s.trim().replace(/^#/, "")).filter(Boolean);
// 채널 이름에 포함되면 감지 (쉼표로 여러 개, "*" 은 모든 채널)
const DEX_CHANNELS = channelList(process.env.DEX_CHANNELS, "포켓몬개체정보방");   // 111, 888-2
const PVP_CHANNELS = channelList(process.env.PVP_CHANNELS, "배틀개체정보방");     // 배틀111
const BATTLE_CHANNELS = channelList(process.env.BATTLE_CHANNELS, "배틀신청");     // 배틀신청 닉네임
const ACQ_CHANNELS = channelList(process.env.ACQ_CHANNELS, "포켓몬획득정보");     // 111, 리자몽 → 획득 경로
const { acquireEmbed } = require("./acquire");
const SCHEDULE_CHANNELS = channelList(process.env.SCHEDULE_CHANNELS, "포켓몬고일정"); // 현재일정 / 다음일정
const SCH = require("./schedule");
const FRIEND_CHANNELS = channelList(process.env.FRIEND_CHANNELS, "친코등록");      // 친코등록 / 친코확인
const FC = require("./friendcode");
const { routeMessage } = require("./router");
const BR = require("./battle-request");

console.log("⚙️ 설정 확인:",
  `DISCORD_TOKEN=${DISCORD_TOKEN ? `있음(${DISCORD_TOKEN.length}자)` : "없음"}`,
  `WEBHOOK_URL=${process.env.WEBHOOK_URL ? "있음" : "없음"}`,
  `GUILD_ID=${GUILD_ID || "없음"}`,
  `DEX_CHANNELS=${DEX_CHANNELS.join(",")}`,
  `PVP_CHANNELS=${PVP_CHANNELS.join(",")}`,
  `ACQ_CHANNELS=${ACQ_CHANNELS.join(",")}`,
  `SCHEDULE_CHANNELS=${SCHEDULE_CHANNELS.join(",")}`,
  `FRIEND_CHANNELS=${FRIEND_CHANNELS.join(",")}`,
  `BATTLE_CHANNELS=${BATTLE_CHANNELS.join(",")}`);
if (!DISCORD_TOKEN) {
  console.error("❌ DISCORD_TOKEN 이 설정되지 않았습니다. Railway → Variables 에 DISCORD_TOKEN 을 추가해 주세요.");
  process.exit(1);
}
if (DISCORD_TOKEN.split(".").length !== 3)
  console.error("⚠️ DISCORD_TOKEN 모양이 이상합니다 (보통 점 2개로 나뉜 긴 문자열). 개발자 포털에서 토큰을 다시 복사해 주세요.");

// 웹훅이 설정되어 있으면 답장을 웹훅으로 보낸다 (웹훅이 연결된 채널에서만, 실패하면 봇이 직접 답장)
let WEBHOOK = clean(process.env.WEBHOOK_URL);
let WEBHOOK_CHANNEL = null;
if (WEBHOOK) fetch(WEBHOOK).then((r) => r.json()).then((w) => {
  if (w.channel_id) { WEBHOOK_CHANNEL = w.channel_id; console.log("🔗 웹훅 연결됨 (채널 " + w.channel_id + ")"); }
  else { console.error("⚠️ 웹훅이 유효하지 않아(삭제됨?) 봇이 직접 답장합니다:", w.message || ""); WEBHOOK = ""; }
}).catch(() => console.error("⚠️ 웹훅 정보를 불러오지 못했습니다. 실패 시 봇이 직접 답장합니다."));

async function send(msg, payload) {
  if (WEBHOOK && (!WEBHOOK_CHANNEL || WEBHOOK_CHANNEL === msg.channel.id)) {
    try {
      const res = await fetch(WEBHOOK, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "포켓몬 GO 도감", ...payload }) });
      if (res.ok) return;
      console.error("⚠️ 웹훅 전송 실패 " + res.status + " → 봇이 직접 답장합니다");
    } catch (e) {
      console.error("⚠️ 웹훅 전송 오류 → 봇이 직접 답장합니다:", e.message);
    }
  }
  await msg.reply({ ...payload, allowedMentions: { repliedUser: false } });
}

/** 현재일정 / 다음일정 응답 (데이터를 못 받으면 안내) */
async function scheduleReply(mode) {
  try {
    return SCH.scheduleEmbed(await SCH.getEvents(), Date.now(), mode);
  } catch {
    return { content: "⚠️ 지금 일정 정보를 불러올 수 없어요. 잠시 후 다시 시도해 주세요." };
  }
}

/** 서버별로 감지하는 채널을 로그에 남긴다 (없으면 경고) */
function reportGuild(g) {
  const find = (list) => g.channels.cache.filter((c) => c.isTextBased && c.isTextBased() && P.channelMatches(c, list));
  for (const [label, list, what] of [
    ["📖 도감번호", DEX_CHANNELS, "DEX_CHANNELS"],
    ["🏆 배틀개체", PVP_CHANNELS, "PVP_CHANNELS"],
    ["⚔️ 배틀신청", BATTLE_CHANNELS, "BATTLE_CHANNELS"],
    ["🗺️ 획득경로", ACQ_CHANNELS, "ACQ_CHANNELS"],
    ["📅 일정", SCHEDULE_CHANNELS, "SCHEDULE_CHANNELS"],
    ["🤝 친코등록", FRIEND_CHANNELS, "FRIEND_CHANNELS"],
  ]) {
    const chans = find(list);
    if (chans.size) console.log(`${label} 서버 '${g.name}': ${chans.map((c) => "#" + c.name).join(", ")}`);
    else console.error(`⚠️ ${label} 서버 '${g.name}': 이름에 '${list.join("/")}' 가 들어간 채널이 없습니다 ` +
      `(채널 이름을 바꾸거나 Railway Variables 의 ${what} 에 채널 이름을 추가하세요)`);
  }
}

/** "배틀신청 닉네임" 처리: 멘션이 있으면 그 사람, 없으면 서버 멤버 검색 */
/** 닉네임(또는 메시지의 멘션)으로 서버 멤버 찾기 → pickMember 결과 */
async function resolveMember(msg, query, authorId) {
  let members = [];
  const mentioned = msg.mentions.members?.first();
  if (mentioned) members = [mentioned];
  else {
    try {
      const found = await msg.guild.members.search({ query: query.replace(/^@/, ""), limit: 10 });
      members = [...found.values()];
    } catch (e) {
      console.error("⚠️ 멤버 검색 실패:", e.message);
    }
  }
  const list = members.map((m) => ({ id: m.id, displayName: m.displayName, username: m.user.username, bot: m.user.bot }));
  return mentioned ? BR.pickMember(list, list[0].displayName, authorId) : BR.pickMember(list, query, authorId);
}

/** 채널의 최근 메시지(최대 500개)에서 신청/수락 기록 읽기 */
/** 채널의 최근 메시지(최대 500개)를 { authorId, content, time, buttonIds } 로 읽기 */
async function fetchHistory(channel) {
  const msgs = [];
  let before;
  for (let i = 0; i < 5; i++) {
    const page = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
    for (const m of page.values()) {
      const buttonIds = [];
      for (const row of m.components || []) for (const c of row.components || []) if (c.customId) buttonIds.push(c.customId);
      msgs.push({ authorId: m.author.id, content: m.content, time: m.createdTimestamp, buttonIds });
    }
    if (page.size < 100) break;
    before = page.last().id;
  }
  return msgs;
}

async function loadRequests(channel) {
  return BR.buildRequests(await fetchHistory(channel), channel.client.user.id);
}

/** 채널 기록에서 등록된 친구 코드 찾기 (없거나 복호화 실패면 null) */
async function loadFriendCode(channel, userId) {
  const enc = FC.findRegistration(await fetchHistory(channel), channel.client.user.id, userId);
  return enc ? FC.decrypt(enc, FRIEND_SECRET) : null;
}

/** 친코등록 / 친코확인 */
async function handleFriendCommand(msg, cmd) {
  const author = { id: msg.author.id, displayName: msg.member?.displayName || msg.author.username };
  if (cmd.type === "register") {
    if (!cmd.code) return msg.reply(FC.invalidCodeMessage());
    const enc = FC.encrypt(cmd.code, FRIEND_SECRET);
    let deleted = false;
    try { await msg.delete(); deleted = true; }
    catch { console.error(`⚠️ #${msg.channel.name}: 코드가 담긴 메시지를 지우지 못했습니다 (봇에 '메시지 관리' 권한 필요)`); }
    return msg.channel.send(FC.registerMessage(author, enc, deleted));
  }
  // 친코확인 닉네임
  const quiet = { parse: [], repliedUser: false };
  if (!cmd.query) return msg.reply({ content: "누구의 친구 코드를 볼까요? 예) `친코확인 홍길동` 또는 `친코확인 @홍길동`", allowedMentions: quiet });
  const r = await resolveMember(msg, cmd.query, author.id);
  if (!r.member) {
    const text = r.error === "self" ? "😅 내 친구 코드는 요청할 수 없어요."
      : r.error === "bot" ? "🤖 봇은 친구 코드가 없어요."
      : BR.requestMessage(r, cmd.query, author).content;
    return msg.reply({ content: text, allowedMentions: quiet });
  }
  const code = await loadFriendCode(msg.channel, r.member.id);
  if (!code) return msg.reply({ content: `❌ **${r.member.displayName}** 님은 아직 친코등록을 하지 않았어요.`, allowedMentions: quiet });
  return msg.reply(FC.requestMessage(r.member, author));
}

/** 친코 버튼: 등록한 본인만 누를 수 있음 */
async function handleFriendButton(it, b) {
  if (it.user.id !== b.owner) {
    return it.reply({ content: "🙅 친구 코드를 등록한 본인만 누를 수 있어요.", flags: MessageFlags.Ephemeral });
  }
  const owner = { id: it.user.id, displayName: it.member?.displayName || it.user.username };
  if (b.action === "delete") {
    await it.message.delete().catch(() => {});
    return it.reply({ content: "🗑️ 친코 등록을 삭제했어요.", flags: MessageFlags.Ephemeral });
  }
  if (b.action === "reject") return it.update(FC.rejectedMessage(owner, b.requester));
  const code = await loadFriendCode(it.channel, owner.id);
  if (!code) return it.update({ content: "⚠️ 등록된 친구 코드를 찾을 수 없어요. `친코등록` 으로 다시 등록해 주세요.", components: [] });
  return it.update(FC.acceptedMessage(owner, b.requester, code));
}

/** 배틀신청 / 배틀신청 확인 / 배틀신청 수락 */
async function handleBattleCommand(msg, cmd) {
  const author = { id: msg.author.id, displayName: msg.member?.displayName || msg.author.username };
  if (cmd.type === "request") {
    const result = await resolveMember(msg, cmd.query, author.id);
    return msg.reply(BR.requestMessage(result, cmd.query, author));
  }
  const requests = await loadRequests(msg.channel);
  if (cmd.type === "check") return msg.reply(BR.checkMessage(requests, author.id));
  if (cmd.type === "end") {
    let partner = null;
    if (cmd.query) {
      const r = await resolveMember(msg, cmd.query, author.id);
      if (!r.member) return msg.reply(BR.requestMessage(r, cmd.query, author));
      partner = r.member;
    }
    return msg.reply(BR.endMessage(author, partner, BR.countEnding(requests, author.id, partner && partner.id)));
  }
  // 수락
  let challengerId = null;
  if (cmd.query) {
    const r = await resolveMember(msg, cmd.query, null);
    if (!r.member) return msg.reply(BR.requestMessage(r, cmd.query, author));
    challengerId = r.member.id;
  }
  const pending = BR.findPending(requests, author.id, challengerId);
  if (!pending) {
    return msg.reply({ content: cmd.query
      ? `❌ '${cmd.query}' 님에게 받은 대기 중인 배틀신청이 없어요. \`배틀신청 확인\` 으로 목록을 볼 수 있어요.`
      : "❌ 받은 대기 중인 배틀신청이 없어요.", allowedMentions: { parse: [], repliedUser: false } });
  }
  return msg.reply(BR.acceptMessage(pending, author));
}

/**
 * 속성 아이콘(bot/type-icons/*.png)을 봇 전용 이모지(pogo_fire 등)로 등록하고 메시지에 사용.
 * 봇 전용 이모지는 봇이 들어간 모든 서버에서 쓸 수 있다. 실패하면 기본 유니코드 이모지를 그대로 쓴다.
 */
async function setupTypeEmojis(c) {
  try {
    const fs = require("fs"), path = require("path");
    const existing = await c.application.emojis.fetch();
    const map = {};
    let created = 0;
    for (const t of Object.keys(P.TYPES)) {
      const name = "pogo_" + t.toLowerCase();
      let emoji = existing.find((e) => e.name === name);
      if (!emoji) {
        const file = path.join(__dirname, "type-icons", t.toLowerCase() + ".png");
        if (!fs.existsSync(file)) continue;
        emoji = await c.application.emojis.create({ attachment: file, name });
        created++;
      }
      map[t] = `<:${emoji.name}:${emoji.id}>`;
    }
    P.setTypeEmojis(map);
    console.log(`🎨 속성 아이콘 이모지 ${Object.keys(map).length}개 사용 (새로 등록 ${created}개)`);
  } catch (e) {
    console.error("⚠️ 속성 아이콘 이모지를 등록하지 못해 기본 이모지를 씁니다:", e.message);
  }
}

let client;
function start(withMessageContent) {
  const intents = [GatewayIntentBits.Guilds];
  if (withMessageContent) intents.push(GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent);
  client = new Client({ intents });
  register(client, withMessageContent);
  client.login(DISCORD_TOKEN).catch((e) => {
    if (/disallowed intents/i.test(e.message) && withMessageContent) {
      console.error("❌❌ MESSAGE CONTENT INTENT 가 꺼져 있어 채널의 '111', '배틀111' 을 읽을 수 없습니다.");
      console.error("   → discord.com/developers/applications → 앱 선택 → Bot → Privileged Gateway Intents");
      console.error("     → 'MESSAGE CONTENT INTENT' 켜기 → Save Changes → Railway 에서 Restart");
      console.error("   지금은 슬래시 명령어(/도감, /배틀 등)만 동작하는 모드로 다시 접속합니다.");
      client.destroy().catch(() => {});
      return start(false);
    }
    if (/invalid token/i.test(e.message))
      console.error("❌ 로그인 실패: 토큰이 올바르지 않습니다. 개발자 포털 → Bot → Reset Token 후 Railway Variables 의 DISCORD_TOKEN 을 새 값으로 바꿔 주세요.");
    else console.error("❌ 로그인 실패:", e.message);
    process.exit(1);
  });
}

function register(client, withMessageContent) {
  client.on(Events.MessageCreate, async (msg) => {
    if (msg.author.bot || !msg.guild) return;
    const ch = msg.channel;
    const route = routeMessage(ch, msg.content, { dex: DEX_CHANNELS, pvp: PVP_CHANNELS, battle: BATTLE_CHANNELS, acq: ACQ_CHANNELS, schedule: SCHEDULE_CHANNELS, friend: FRIEND_CHANNELS });
    if (!route) return;
    if (route.kind === "battleCmd") {
      try { await handleBattleCommand(msg, route.cmd); }
      catch (e) { console.error(`❌ 배틀신청 응답 실패 (#${ch.name}):`, e.message); }
      return;
    }
    if (route.kind === "friend") {
      try { await handleFriendCommand(msg, route.cmd); }
      catch (e) { console.error(`❌ 친코 응답 실패 (#${ch.name}):`, e.message); }
      return;
    }
    if (route.kind === "schedule") {
      try { await send(msg, await scheduleReply(route.mode)); }
      catch (e) { console.error(`❌ 일정 응답 실패 (#${ch.name}):`, e.message); }
      return;
    }
    const q = route.q, battle = route.kind === "pvp";
    try {
      const form = q.form ? String(q.form) : undefined;
      const { ephemeral, ...payload } = route.kind === "acq" ? acquireEmbed(q.id)
        : !q.valid ? badForm(q.id)
        : battle ? battleEmbed(String(q.id), form) : dexEmbed(String(q.id), form);
      await send(msg, payload);
    } catch (e) {
      if (e.code === 50013 || e.code === 50001 || /Missing (Permissions|Access)/i.test(e.message))
        console.error(`❌ 권한 부족: 서버 '${msg.guild.name}' 의 #${ch.name} 에서 답장할 수 없습니다. ` +
          "서버 설정 → 역할(또는 채널 권한)에서 봇에게 '채널 보기 · 메시지 보내기 · 링크 첨부 · 메시지 기록 보기' 를 허용해 주세요.");
      else console.error("채널 응답 실패:", e.message);
    }
  });

  client.once(Events.ClientReady, async (c) => {
    await setupTypeEmojis(c);
    // GUILD_ID 가 있으면 해당 서버에 즉시 등록, 없으면 전체(전파에 최대 1시간)
    if (GUILD_ID) await c.application.commands.set(commands, GUILD_ID);
    else await c.application.commands.set(commands);
    console.log(`✅ ${c.user.tag} 로그인 완료 · 명령어 ${commands.length}개 등록 (${GUILD_ID ? "서버 " + GUILD_ID : "전역"})`);
    if (withMessageContent) console.log(`👀 도감번호: ${DEX_CHANNELS.join(", ")} · 배틀개체: ${PVP_CHANNELS.join(", ")} · 배틀신청: ${BATTLE_CHANNELS.join(", ")} · 획득경로: ${ACQ_CHANNELS.join(", ")} · 일정: ${SCHEDULE_CHANNELS.join(", ")} · 친코: ${FRIEND_CHANNELS.join(", ")}${WEBHOOK ? " · 응답은 웹훅으로 전송" : ""}`);
    else console.log("⚠️ 슬래시 명령어 전용 모드 (MESSAGE CONTENT INTENT 를 켜면 채널 감지가 동작합니다)");
    for (const g of c.guilds.cache.values()) reportGuild(g);
  });

  client.on(Events.GuildCreate, (g) => { console.log(`➕ 새 서버에 추가됨: ${g.name}`); reportGuild(g); });

  client.on(Events.InteractionCreate, async (it) => {
    try {
      if (it.isAutocomplete()) {
        const focused = it.options.getFocused(true);
        if (focused.name === "포켓몬") return it.respond(P.suggest(focused.value));
        if (focused.name === "폼") {
          const id = P.findId(it.options.getString("포켓몬") || "");
          const forms = id ? P.DEX[id].forms : [];
          return it.respond(forms.slice(0, 25).map((f, i) => ({ name: `${id}-${i + 1} · ${P.formLabel(f.f, id)}`.slice(0, 100), value: String(i + 1) })));
        }
        return it.respond([]);
      }
      if (it.isButton()) {
        const b = FC.parseButtonId(it.customId);
        if (b) return await handleFriendButton(it, b);
        return;
      }
      if (!it.isChatInputCommand()) return;

      const o = it.options, q = o.getString("포켓몬"), form = o.getString("폼");
      let reply;
      if (it.commandName === "도감") reply = dexEmbed(q, form);
      else if (it.commandName === "cp")
        reply = cpEmbed(q, o.getInteger("공격"), o.getInteger("방어"), o.getInteger("체력"), o.getNumber("레벨") ?? 40, form);
      else if (it.commandName === "배틀") reply = battleEmbed(q, form);
    else if (it.commandName === "일정") reply = await scheduleReply(o.getString("종류") === "다음" ? "upcoming" : "current");
    else if (it.commandName === "획득") {
      const id = P.findId(q);
      reply = id ? acquireEmbed(id) : { content: `❌ \`${q}\` 에 해당하는 포켓몬을 찾을 수 없습니다.`, ephemeral: true };
    }
      else if (it.commandName === "개체")
        reply = ivEmbed(q, o.getInteger("cp"), o.getInteger("hp"), o.getInteger("최소개체") ?? 0, form);
      else return;

      const { ephemeral, ...payload } = reply;
      await it.reply(ephemeral ? { ...payload, flags: MessageFlags.Ephemeral } : payload);
    } catch (e) {
      console.error(e);
      if (it.isRepliable() && !it.replied) it.reply({ content: "⚠️ 오류가 발생했습니다.", flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  });
}

start(true);
