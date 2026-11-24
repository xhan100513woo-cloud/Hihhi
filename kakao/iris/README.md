# 거쿨 봇 — Iris 버전 (루팅 폰 한 대로)

같은 사람이 같은 방에 **같은 거래글**(`ㄱㄹ`, `거래`, `구매`, `판매`, `ㄱㅁ`, `ㅍㅁ`, `ㅍㅍ` 포함)을
**1시간 안에** 다시 올리면 `거쿨경고 1 드립니다.` 라고 답합니다.

```
카카오톡 ──(Iris가 대화 기록을 읽음)──> Iris ──웹훅──> trade_cooldown_bot.py (Termux)
   ^                                                          │
   └─────────────── Iris /reply 로 답장 <─────────────────────┘
```

## 1. Iris 설치 (폰)
Iris 설명서(github.com/dolidolih/Iris)를 따라 설치합니다. 요약:
1. Releases 에서 `Iris.apk` 와 `iris_control` 을 받습니다.
2. `Iris.apk` 를 `/data/local/tmp` 에 넣고 `./iris_control start` 로 켭니다.
   (Termux 에서 바로 돌릴 때는 저장소의 `iris_control_termux` 를 쓰세요)
3. 폰 브라우저에서 `http://127.0.0.1:3000/dashboard` 를 엽니다.

## 2. 봇 실행 (Termux)
```
pkg install python
python trade_cooldown_bot.py
```
`거쿨 봇 시작: 웹훅 http://127.0.0.1:5000/webhook ...` 이 나오면 켜진 것입니다.

## 3. Iris 와 연결
Iris 대시보드에서 **Web Server Endpoint** 를 `http://127.0.0.1:5000/webhook` 으로 저장합니다.
(또는 `curl -X POST -H "Content-Type: application/json" -d '{"endpoint":"http://127.0.0.1:5000/webhook"}' http://127.0.0.1:3000/config/endpoint`)

이제 단톡방에 같은 거래글을 두 번 올려 보면 경고가 나옵니다.

## 설정 (`trade_cooldown_bot.py` 맨 위)
| 항목 | 기본값 | 설명 |
|---|---|---|
| `KEYWORDS` | 위 7개 | 거래글로 볼 단어 |
| `COOLDOWN_SEC` | 3600 (1시간) | 쿨타임 |
| `WARNING` | `거쿨경고 1 드립니다.` | 보낼 문구 |
| `ROOMS` | `[]` (모든 방) | 특정 방만: `["포켓몬고 거래방"]` |
| `PER_SENDER` | `True` | `False` 면 누가 올렸든 같은 글이면 경고 |

환경변수 `IRIS_URL`(기본 `http://127.0.0.1:3000`), `BOT_PORT`(기본 `5000`)로 주소·포트를 바꿀 수 있습니다.
Iris 포트를 바꿨다면 `IRIS_URL=http://127.0.0.1:포트 python trade_cooldown_bot.py` 로 실행하세요.

## 참고
- 방·사람은 이름이 아니라 Iris 가 주는 `chat_id`·`user_id` 로 구분해서, 닉네임을 바꿔도 같은 사람으로 봅니다.
- 기록은 메모리에만 있어 봇을 재시작하면 초기화됩니다.
- Termux 가 꺼지지 않게 알림창에서 **Acquire wakelock** 을 켜 두세요.
- 테스트: `python test_bot.py`
