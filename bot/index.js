"use strict";
// 포켓몬 GO 도감 디스코드 봇
const { Client, Events, GatewayIntentBits, MessageFlags } = require("discord.js");
const commands = require("./commands");
const { dexEmbed, cpEmbed, ivEmbed, battleEmbed } = require("./embeds");
const P = require("./pogo");

try { process.loadEnvFile(require("path").join(__dirname, ".env")); } catch { /* .env 없으면 환경변수 사용 */ }

/** 붙여 넣을 때 섞이기 쉬운 공백·줄바꿈·따옴표·"Bot " 접두어 제거 */
const clean = (v) => String(v || "").trim().replace(/^["'`]+|["'`]+$/g, "").replace(/^Bot\s+/i, "").trim();
const DISCORD_TOKEN = clean(process.env.DISCORD_TOKEN);
const GUILD_ID = clean(process.env.GUILD_ID);
// 도감번호를 감지할 채널 (쉼표로 여러 개). 채널 ID 또는 이름 모두 가능
const DEX_CHANNELS = (process.env.DEX_CHANNELS || "일반").split(",").map((s) => s.trim().replace(/^#/, "")).filter(Boolean);

console.log("⚙️ 설정 확인:",
  `DISCORD_TOKEN=${DISCORD_TOKEN ? `있음(${DISCORD_TOKEN.length}자)` : "없음"}`,
  `WEBHOOK_URL=${process.env.WEBHOOK_URL ? "있음" : "없음"}`,
  `GUILD_ID=${GUILD_ID || "없음"}`,
  `DEX_CHANNELS=${DEX_CHANNELS.join(",")}`);
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
    const watched = DEX_CHANNELS.includes(ch.id) || DEX_CHANNELS.includes(ch.name);
    if (!watched) return;
    const battleId = P.parseBattle(msg.content);
    const id = battleId || P.parseDexNumber(msg.content);
    if (!id) return;
    try {
      const payload = battleId ? battleEmbed(String(id)) : dexEmbed(String(id));
      await send(msg, payload);
    } catch (e) {
      console.error("채널 응답 실패:", e.message);
    }
  });

  client.once(Events.ClientReady, async (c) => {
    // GUILD_ID 가 있으면 해당 서버에 즉시 등록, 없으면 전체(전파에 최대 1시간)
    if (GUILD_ID) await c.application.commands.set(commands, GUILD_ID);
    else await c.application.commands.set(commands);
    console.log(`✅ ${c.user.tag} 로그인 완료 · 명령어 ${commands.length}개 등록 (${GUILD_ID ? "서버 " + GUILD_ID : "전역"})`);
    if (withMessageContent) console.log(`👀 도감번호 감지 채널: ${DEX_CHANNELS.join(", ")}${WEBHOOK ? " · 응답은 웹훅으로 전송" : ""}`);
    else console.log("⚠️ 슬래시 명령어 전용 모드 (MESSAGE CONTENT INTENT 를 켜면 채널 감지가 동작합니다)");
  });

  client.on(Events.InteractionCreate, async (it) => {
    try {
      if (it.isAutocomplete()) {
        const focused = it.options.getFocused(true);
        if (focused.name === "포켓몬") return it.respond(P.suggest(focused.value));
        if (focused.name === "폼") {
          const id = P.findId(it.options.getString("포켓몬") || "");
          const forms = id ? P.DEX[id].forms : [];
          return it.respond(forms.slice(0, 25).map((f, i) => ({ name: `${i} · ${P.formLabel(f.f)}`.slice(0, 100), value: String(i) })));
        }
        return it.respond([]);
      }
      if (!it.isChatInputCommand()) return;

      const o = it.options, q = o.getString("포켓몬"), form = o.getString("폼");
      let reply;
      if (it.commandName === "도감") reply = dexEmbed(q, form);
      else if (it.commandName === "cp")
        reply = cpEmbed(q, o.getInteger("공격"), o.getInteger("방어"), o.getInteger("체력"), o.getNumber("레벨") ?? 40, form);
      else if (it.commandName === "배틀") reply = battleEmbed(q, form);
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
