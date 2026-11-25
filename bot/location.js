"use strict";
// 내 위치: 디스코드는 사용자 위치를 봇에 주지 않으므로, 1회용 링크로 휴대폰 브라우저의 위치를 받아 10진법 좌표를 보여 준다.
//  1) #내위치 에서 "내위치" → [📍 내 위치 링크 받기] 버튼
//  2) 버튼을 누른 사람에게만 보이는 1회용 링크 (10분)
//  3) 페이지에서 위치 허용 → 좌표 표시·복사·지도, [디스코드에 보내기] 를 누르면 채널에 게시
const http = require("http");
const crypto = require("crypto");

const TOKEN_TTL_MS = 10 * 60 * 1000;
const tokens = new Map();   // token → { userId, displayName, channelId, exp }

/** "내위치" / "내 위치" */
function isLocationCommand(content) {
  return String(content).trim().replace(/\s+/g, "") === "내위치";
}

function createToken(info, now = Date.now()) {
  for (const [t, v] of tokens) if (v.exp < now) tokens.delete(t);   // 만료 정리
  const token = crypto.randomBytes(18).toString("base64url");
  tokens.set(token, { ...info, exp: now + TOKEN_TTL_MS });
  return token;
}
function peekToken(token, now = Date.now()) {
  const v = tokens.get(token);
  return v && v.exp >= now ? v : null;
}
/** 1회용: 꺼내면서 삭제 */
function takeToken(token, now = Date.now()) {
  const v = peekToken(token, now);
  tokens.delete(token);
  return v;
}

/** 위도·경도 검증 후 소수점 6자리 */
function cleanCoords(lat, lng, acc) {
  lat = Number(lat); lng = Number(lng); acc = Number(acc);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat: +lat.toFixed(6), lng: +lng.toFixed(6), acc: Number.isFinite(acc) && acc >= 0 ? Math.round(acc) : null };
}

const quiet = { parse: [], repliedUser: false };

function promptMessage() {
  return {
    content: "📍 아래 버튼을 누르면 **나만 보이는** 위치 링크를 보내 드려요. (10분 동안 한 번 사용 가능)",
    components: [{ type: 1, components: [{ type: 2, style: 1, label: "내 위치 링크 받기", emoji: { name: "📍" }, custom_id: "loc:req" }] }],
    allowedMentions: quiet,
  };
}

function linkMessage(url) {
  return {
    content: "🔗 아래 버튼을 눌러 페이지를 열고 **위치 권한을 허용**하세요. 이 링크는 나만 볼 수 있고 10분 후 만료돼요.",
    components: [{ type: 1, components: [{ type: 2, style: 5, label: "내 위치 확인하기", url }] }],
  };
}

function noDomainMessage() {
  return {
    content: "⚠️ 아직 위치 페이지 주소가 설정되지 않았어요. 관리자: Railway → Hihhi 서비스 → Settings → Networking → **Generate Domain** 을 눌러 주세요.",
  };
}

const mapUrl = (c) => `https://www.google.com/maps?q=${c.lat},${c.lng}`;

/** 채널에 올라가는 좌표 메시지 */
function postMessage(info, c) {
  return {
    content: `📍 **${info.displayName}** 님의 현재 위치\n\`${c.lat}, ${c.lng}\`` +
      (c.acc !== null ? `\n(정확도 약 ${c.acc}m)` : "") + `\n[지도에서 보기](<${mapUrl(c)}>)`,
    allowedMentions: { parse: [] },
  };
}

const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

/** 위치 페이지 HTML */
function pageHtml(token, info) {
  const valid = !!info;
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>내 위치</title><style>
:root{--bg:#f4f5f8;--card:#fff;--text:#1d2330;--muted:#6b7280;--accent:#5865f2;--line:#e3e6ec}
@media (prefers-color-scheme:dark){:root{--bg:#14171d;--card:#1d2129;--text:#e7e9ee;--muted:#9aa1ad;--line:#2c313b}}
body{margin:0;padding:16px;background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif}
.card{max-width:480px;margin:24px auto;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:20px}
h1{font-size:1.3rem;margin:0 0 8px}p{color:var(--muted);margin:6px 0}
.coord{font:600 1.35rem ui-monospace,Menlo,monospace;margin:16px 0 4px;word-break:break-all}
button,a.btn{display:block;width:100%;box-sizing:border-box;margin-top:10px;padding:12px;border:0;border-radius:10px;font:inherit;font-weight:600;text-align:center;text-decoration:none;cursor:pointer}
.primary{background:var(--accent);color:#fff}.sub{background:var(--line);color:var(--text)}
button:disabled{opacity:.6}.hide{display:none}
</style></head><body><div class="card">
<h1>📍 내 위치 좌표</h1>
${valid ? `<p><b>${esc(info.displayName)}</b> 님 전용 링크예요.</p>
<button id="get" class="primary">내 위치 가져오기</button>
<div id="out" class="hide">
  <div class="coord" id="coord"></div><p id="acc"></p>
  <button id="copy" class="sub">좌표 복사</button>
  <a id="map" class="btn sub" target="_blank" rel="noopener">지도에서 보기</a>
  <button id="send" class="primary">디스코드에 보내기</button>
  <p>보내면 채널 사람들이 이 위치를 볼 수 있어요.</p>
</div>
<p id="msg"></p>
<script>
const T=${JSON.stringify(token)};let C=null;const $=id=>document.getElementById(id);
$("get").onclick=()=>{if(!navigator.geolocation){$("msg").textContent="이 브라우저는 위치 기능을 지원하지 않아요.";return}
$("get").disabled=true;$("msg").textContent="위치를 가져오는 중…";
navigator.geolocation.getCurrentPosition(p=>{C={lat:+p.coords.latitude.toFixed(6),lng:+p.coords.longitude.toFixed(6),acc:Math.round(p.coords.accuracy)};
$("coord").textContent=C.lat+", "+C.lng;$("acc").textContent="정확도 약 "+C.acc+"m";$("map").href="https://www.google.com/maps?q="+C.lat+","+C.lng;
$("out").classList.remove("hide");$("msg").textContent="";$("get").disabled=false;$("get").textContent="다시 가져오기"},
e=>{$("get").disabled=false;$("msg").textContent=e.code===1?"위치 권한이 거부됐어요. 브라우저 설정에서 위치를 허용해 주세요.":"위치를 가져오지 못했어요. 다시 시도해 주세요."},
{enableHighAccuracy:true,timeout:15000,maximumAge:0})};
$("copy").onclick=async()=>{try{await navigator.clipboard.writeText(C.lat+", "+C.lng);$("msg").textContent="복사했어요!"}catch{$("msg").textContent="길게 눌러 직접 복사해 주세요."}};
$("send").onclick=async()=>{$("send").disabled=true;try{const r=await fetch("/api/loc",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({t:T,...C})});
const j=await r.json();$("msg").textContent=j.ok?"✅ 디스코드에 보냈어요!":"❌ "+(j.error||"보내지 못했어요")}catch{$("msg").textContent="❌ 보내지 못했어요";$("send").disabled=false}};
</script>` : `<p>링크가 만료됐거나 이미 사용됐어요. 디스코드에서 <b>내위치</b> 를 다시 입력해 주세요.</p>`}
</div></body></html>`;
}

/**
 * 웹 서버: GET /loc?t= (페이지), POST /api/loc (좌표 보내기), GET / (상태 확인)
 * onPost(info, coords) 는 디스코드 채널에 게시하는 함수
 */
function startServer(port, onPost) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    const send = (code, type, body) => { res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }); res.end(body); };
    if (req.method === "GET" && url.pathname === "/loc") {
      const t = url.searchParams.get("t") || "";
      return send(200, "text/html; charset=utf-8", pageHtml(t, peekToken(t)));
    }
    if (req.method === "POST" && url.pathname === "/api/loc") {
      let body = "";
      req.on("data", (d) => { body += d; if (body.length > 2000) req.destroy(); });
      req.on("end", async () => {
        let j;
        try { j = JSON.parse(body); } catch { return send(400, "application/json", JSON.stringify({ ok: false, error: "잘못된 요청" })); }
        const c = cleanCoords(j.lat, j.lng, j.acc);
        if (!c) return send(400, "application/json", JSON.stringify({ ok: false, error: "좌표가 올바르지 않아요" }));
        const info = takeToken(String(j.t || ""));
        if (!info) return send(410, "application/json", JSON.stringify({ ok: false, error: "링크가 만료됐거나 이미 사용됐어요" }));
        try { await onPost(info, c); send(200, "application/json", JSON.stringify({ ok: true })); }
        catch (e) { console.error("❌ 위치 게시 실패:", e.message); send(500, "application/json", JSON.stringify({ ok: false, error: "디스코드에 보내지 못했어요" })); }
      });
      return;
    }
    if (url.pathname === "/") return send(200, "text/plain; charset=utf-8", "ok");
    send(404, "text/plain; charset=utf-8", "not found");
  });
  server.listen(port);
  return server;
}

module.exports = {
  isLocationCommand, createToken, peekToken, takeToken, cleanCoords,
  promptMessage, linkMessage, noDomainMessage, postMessage, pageHtml, startServer, TOKEN_TTL_MS,
};
