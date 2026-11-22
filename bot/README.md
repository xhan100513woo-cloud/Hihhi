# 포켓몬 GO 도감 디스코드 봇

## 명령어
| 명령어 | 예시 | 설명 |
|---|---|---|
| `/도감 포켓몬 [폼]` | `/도감 포켓몬:6` | 타입, 능력치, 최대 CP(Lv40/50/51), 상황별 CP, 약점·저항·강점 속성 |
| `/cp 포켓몬 공격 방어 체력 [레벨] [폼]` | `/cp 포켓몬:뮤츠 공격:15 방어:14 체력:15 레벨:40` | CP, HP, 슈퍼·하이퍼리그 최적 레벨, 레벨별 CP |
| `/개체 포켓몬 cp [hp] [최소개체] [폼]` | `/개체 포켓몬:리자몽 cp:2889 hp:158` | 게임 CP(·HP)로 가능한 레벨·개체값 조합 |

포켓몬 이름과 폼은 입력하는 동안 자동완성됩니다.

### 채널에 도감번호만 입력하기
`#일반` 채널에 `25`, `#150`, `6번`, `No.6` 처럼 **도감번호만** 적으면 봇이 그 포켓몬 정보를 답장합니다.
(다른 말과 섞인 숫자, 예: `25마리 잡았다` 는 무시합니다)

- 감지할 채널은 `.env` 의 `DEX_CHANNELS` 로 바꿀 수 있습니다 (채널 이름 또는 ID, 쉼표로 여러 개, 기본값 `일반`).
- **필수:** Developer Portal → Bot → *Privileged Gateway Intents* 에서 **MESSAGE CONTENT INTENT** 를 켜야 합니다.
- 봇에게 해당 채널의 *메시지 보기 / 메시지 보내기 / 링크 첨부* 권한이 있어야 합니다.

## 설치 및 실행
1. [Discord Developer Portal](https://discord.com/developers/applications) → **New Application**
2. **Bot** 탭 → **Reset Token** 으로 토큰 복사
3. 같은 Bot 탭의 **Privileged Gateway Intents** 에서 **MESSAGE CONTENT INTENT** 켜기
4. **OAuth2 → URL Generator** 에서 `bot`, `applications.commands` 체크, 권한은 `Send Messages`, `Embed Links`, `Read Message History` → 생성된 URL로 서버에 초대
5. 이 폴더에서:
   ```
   cp .env.example .env     # .env 에 DISCORD_TOKEN 입력 (GUILD_ID 는 선택)
   npm install
   npm start
   ```
   `GUILD_ID` 에 서버 ID를 넣으면 명령어가 바로 보이고, 비워두면 전역 등록이라 최대 1시간 걸릴 수 있습니다.

Node.js 20.12 이상이 필요합니다. 봇 실행 중에는 컴퓨터(또는 서버)가 켜져 있어야 합니다.

## 테스트
`npm test` — 토큰 없이 계산값과 Discord 메시지 길이 제한을 검사합니다.

데이터는 상위 폴더의 `data.js` 를 사용합니다 (`scripts/build_data.py` 로 갱신).

## 웹훅으로 보내기 (봇 토큰 없이)
웹훅은 명령어를 받을 수는 없고, 결과 메시지를 채널에 **보내기만** 합니다.
`.env` 에 `WEBHOOK_URL` 을 넣고:
```
node webhook.js 도감 리자몽
node webhook.js cp 뮤츠 15 14 15 40
node webhook.js 개체 리자몽 2889 158
```
웹훅 URL은 비밀번호처럼 다뤄 주세요 (아는 사람은 누구나 채널에 글을 쓸 수 있습니다).

## Railway 로 24시간 실행하기
저장소 루트의 `package.json` / `railway.json` 으로 바로 배포됩니다 (`npm start` → `node bot/index.js`).

1. https://railway.com 에 GitHub 로 가입
2. **New Project → Deploy from GitHub repo → Hihhi** 선택 (Root Directory 는 비워 둠)
3. 서비스의 **Variables** 에 추가
   - `DISCORD_TOKEN` = 봇 토큰 (필수)
   - `WEBHOOK_URL` = 웹훅 주소 (선택)
   - `DEX_CHANNELS` = `일반` (선택, 기본값)
   - `GUILD_ID` = 서버 ID (선택)
4. 배포 로그에 `✅ ... 로그인 완료` 가 보이면 `#일반` 에 `111` 입력해서 확인
