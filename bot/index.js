"use strict";
// 포켓몬 GO 도감 디스코드 봇
const { Client, Events, GatewayIntentBits, MessageFlags } = require("discord.js");
const commands = require("./commands");
const { dexEmbed, cpEmbed, ivEmbed } = require("./embeds");
const P = require("./pogo");

try { process.loadEnvFile(require("path").join(__dirname, ".env")); } catch { /* .env 없으면 환경변수 사용 */ }
const { DISCORD_TOKEN, GUILD_ID } = process.env;
// 도감번호를 감지할 채널 (쉼표로 여러 개). 채널 ID 또는 이름 모두 가능
const DEX_CHANNELS = (process.env.DEX_CHANNELS || "일반").split(",").map((s) => s.trim()).filter(Boolean);
if (!DISCORD_TOKEN) { console.error("DISCORD_TOKEN 이 설정되지 않았습니다. bot/.env 파일을 만들어 주세요."); process.exit(1); }

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

client.on(Events.MessageCreate, async (msg) => {
  if (msg.author.bot || !msg.guild) return;
  const ch = msg.channel;
  const watched = DEX_CHANNELS.includes(ch.id) || DEX_CHANNELS.includes(ch.name);
  if (!watched) return;
  const id = P.parseDexNumber(msg.content);
  if (!id) return;
  try {
    await msg.reply({ ...dexEmbed(String(id)), allowedMentions: { repliedUser: false } });
  } catch (e) {
    console.error("채널 응답 실패:", e.message);
  }
});

client.once(Events.ClientReady, async (c) => {
  // GUILD_ID 가 있으면 해당 서버에 즉시 등록, 없으면 전체(전파에 최대 1시간)
  if (GUILD_ID) await c.application.commands.set(commands, GUILD_ID);
  else await c.application.commands.set(commands);
  console.log(`✅ ${c.user.tag} 로그인 완료 · 명령어 ${commands.length}개 등록 (${GUILD_ID ? "서버 " + GUILD_ID : "전역"})`);
  console.log(`👀 도감번호 감지 채널: ${DEX_CHANNELS.join(", ")}`);
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

client.login(DISCORD_TOKEN).catch((e) => {
  if (/disallowed intents/i.test(e.message))
    console.error("❌ Developer Portal → Bot → Privileged Gateway Intents 에서 'MESSAGE CONTENT INTENT' 를 켜 주세요.");
  else console.error("❌ 로그인 실패:", e.message);
  process.exit(1);
});
