"use strict";
// 웹훅으로 조회 결과를 채널에 보내기 (봇 토큰 없이 사용)
//   node webhook.js 도감 리자몽 [폼]
//   node webhook.js cp 뮤츠 15 14 15 [레벨] [폼]
//   node webhook.js 개체 리자몽 2889 [hp] [최소개체] [폼]
const { dexEmbed, cpEmbed, ivEmbed } = require("./embeds");

try { process.loadEnvFile(require("path").join(__dirname, ".env")); } catch { /* 환경변수 사용 */ }
const url = process.env.WEBHOOK_URL;
if (!url) { console.error("WEBHOOK_URL 이 설정되지 않았습니다. bot/.env 에 넣어 주세요."); process.exit(1); }

const [cmd, q, ...a] = process.argv.slice(2);
const n = (v) => (v === undefined || v === "" ? undefined : Number(v));
let r;
if (cmd === "도감") r = dexEmbed(q, a[0]);
else if (cmd === "cp") r = cpEmbed(q, n(a[0]) ?? 15, n(a[1]) ?? 15, n(a[2]) ?? 15, n(a[3]) ?? 40, a[4]);
else if (cmd === "개체") r = ivEmbed(q, n(a[0]), n(a[1]), n(a[2]) ?? 0, a[3]);
else { console.error("사용법: node webhook.js <도감|cp|개체> <포켓몬> [...]"); process.exit(1); }
if (r.ephemeral) { console.error(r.content); process.exit(1); }

fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "포켓몬 GO 도감", ...r }),
}).then(async (res) => {
  if (!res.ok) { console.error("전송 실패:", res.status, await res.text()); process.exit(1); }
  console.log("✅ 전송 완료");
});
