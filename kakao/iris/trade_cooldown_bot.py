#!/usr/bin/env python3
"""
카카오톡 거래글 쿨타임(거쿨) 경고 봇 — Iris 용 (루팅 폰 + Termux)

같은 사람이 같은 방에 같은 거래글(ㄱㄹ, 거래, 구매, 판매, ㄱㅁ, ㅍㅁ, ㅍㅍ 포함)을
1시간 안에 다시 올리면 "거쿨경고 1 드립니다." 라고 답합니다.

Iris 가 새 메시지를 이 프로그램(웹훅)으로 보내고, 이 프로그램은 Iris 의 /reply 로 답장합니다.
추가 설치 없이 파이썬 기본 기능만 씁니다.  실행:  python trade_cooldown_bot.py
"""
import json
import os
import re
import threading
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# ───────── 설정 ─────────
KEYWORDS = ["ㄱㄹ", "거래", "구매", "판매", "ㄱㅁ", "ㅍㅁ", "ㅍㅍ"]
COOLDOWN_SEC = 60 * 60                      # 1시간
WARNING = "거쿨경고 1 드립니다."
ROOMS = []                                  # 비우면 모든 방. 예: ["포켓몬고 거래방"]
PER_SENDER = True                           # False: 누가 올렸든 같은 글이면 경고
IRIS_URL = os.environ.get("IRIS_URL", "http://127.0.0.1:3000")   # Iris 주소
LISTEN_PORT = int(os.environ.get("BOT_PORT", "5000"))            # 이 봇이 웹훅을 받을 포트
# ───────────────────────

_last_posted = {}           # key -> 마지막으로 올라온 시각(초)
_lock = threading.Lock()
_PUNCT = re.compile(r"[\s​!?.~,·…\-_=+*#@^]+")


def has_trade_keyword(text):
    return any(k in text for k in KEYWORDS)


def normalize(text):
    """띄어쓰기·줄바꿈·문장부호만 다른 글은 같은 글로 봄"""
    return _PUNCT.sub("", str(text)).lower()


def check_message(room, sender, msg, now=None):
    """경고 문구(str) 또는 None. room/sender 는 방·사람을 구분하는 값(ID 권장)."""
    if now is None:
        now = time.time()
    if not msg or not has_trade_keyword(msg):
        return None
    body = normalize(msg)
    if not body:
        return None
    key = (str(room), str(sender) if PER_SENDER else "", body)
    with _lock:
        for k in [k for k, t in _last_posted.items() if now - t >= COOLDOWN_SEC]:
            del _last_posted[k]
        prev = _last_posted.get(key)
        _last_posted[key] = now          # 다시 올린 시점부터 1시간 다시 계산
    if prev is not None and now - prev < COOLDOWN_SEC:
        return WARNING
    return None


def reset():
    with _lock:
        _last_posted.clear()


def send_reply(chat_id, text):
    data = json.dumps({"type": "text", "room": str(chat_id), "data": text}).encode()
    req = urllib.request.Request(IRIS_URL + "/reply", data=data,
                                 headers={"Content-Type": "application/json"})
    try:
        urllib.request.urlopen(req, timeout=10).read()
    except Exception as e:
        print("답장 실패:", e)


def handle_event(payload, reply=send_reply):
    """Iris 웹훅 한 건 처리. 경고를 보냈으면 True."""
    raw = payload.get("json") or {}
    msg = payload.get("msg") or raw.get("message") or ""
    room_name = payload.get("room") or ""
    chat_id = raw.get("chat_id")
    user_id = raw.get("user_id") or payload.get("sender")
    if not chat_id:
        return False
    if ROOMS and room_name not in ROOMS:
        return False
    warn = check_message(chat_id, user_id, msg)
    if warn:
        print(f"[경고] {room_name} / {payload.get('sender')}: {msg[:30]!r}")
        reply(chat_id, warn)
        return True
    return False


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length)
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"ok")
        try:
            handle_event(json.loads(body.decode("utf-8")))
        except Exception as e:
            print("처리 오류:", e)

    def log_message(self, *args):   # 요청마다 찍히는 로그 끄기
        pass


if __name__ == "__main__":
    print(f"거쿨 봇 시작: 웹훅 http://127.0.0.1:{LISTEN_PORT}/webhook  →  Iris {IRIS_URL}")
    ThreadingHTTPServer(("0.0.0.0", LISTEN_PORT), Handler).serve_forever()
