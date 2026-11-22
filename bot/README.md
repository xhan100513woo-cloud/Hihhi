# 포켓몬 GO 도감 디스코드 봇

## 명령어
| 명령어 | 예시 | 설명 |
|---|---|---|
| `/도감 포켓몬 [폼]` | `/도감 포켓몬:6` | 타입, 능력치, 최대 CP(Lv40/50/51), 상황별 CP, 약점·저항·강점 속성 |
| `/cp 포켓몬 공격 방어 체력 [레벨] [폼]` | `/cp 포켓몬:뮤츠 공격:15 방어:14 체력:15 레벨:40` | CP, HP, 슈퍼·하이퍼리그 최적 레벨, 레벨별 CP |
| `/개체 포켓몬 cp [hp] [최소개체] [폼]` | `/개체 포켓몬:리자몽 cp:2889 hp:158` | 게임 CP(·HP)로 가능한 레벨·개체값 조합 |

포켓몬 이름과 폼은 입력하는 동안 자동완성됩니다.

## 설치 및 실행
1. [Discord Developer Portal](https://discord.com/developers/applications) → **New Application**
2. **Bot** 탭 → **Reset Token** 으로 토큰 복사
3. **OAuth2 → URL Generator** 에서 `bot`, `applications.commands` 체크 → 생성된 URL로 서버에 초대
4. 이 폴더에서:
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
