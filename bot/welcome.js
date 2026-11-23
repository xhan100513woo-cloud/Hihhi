"use strict";
// 새 멤버 환영 메시지: 공지방에는 규칙·봇 사용법 전체, 메인정보방에는 짧은 인사

const WELCOME_TEXT = `안녕하세요~ 공지 지켜가며 활동해주세요~

1. 욕설, 분탕 등등은 바로 추방입니다.

2. 봇은 토큰을 사용하여 돌아갑니다. 필요한게 아니면 봇 활용은 자제해주세요.

3. 거ㄹㅐ는 불가능 합니다.

4. 반말, 친목 피해가지않는선에서 가능합니다.

5. 가끔 이벤트 합니다.

봇 사용법

포켓몬개체정보 : 도감번호 or 이름

배틀개체정보 : 배틀 도감번호 or 배틀 이름

포켓몬획득정보 : 도감번호 or 이름

포켓몬고일정 : 현재일정, 다음일정

배틀신청 : 배틀신청 닉네임 -> 받는사람은 배틀신청 수락 -> 배틀신청 확인 -> 배틀끝난후 배틀종료

친코등록 : 친코등록 12자리코드 -> 친코확인 이름 -> 등록자가 수락버튼 누르면 친코 나옵니다.

※폼체인지 포켓몬은 그냥 도감번호or 도감번호-1하면 기본폼, 도감번호-2하면 폼체인지 모습이 나옵니다`;

/** 새 멤버 환영 메시지 (그 멤버만 멘션 알림) */
function welcomeMessage(member) {
  return { content: `<@${member.id}> ${WELCOME_TEXT}`, allowedMentions: { users: [member.id] } };
}

const GREET_TEXT = "어서오세요~ 공지방가서 공지한번만 읽어주세요~ 봇사용법 나와있습니다~";

/** 메인정보방 짧은 인사 (그 멤버만 멘션 알림) */
function greetMessage(member) {
  return { content: `<@${member.id}> ${GREET_TEXT}`, allowedMentions: { users: [member.id] } };
}

module.exports = { WELCOME_TEXT, welcomeMessage, GREET_TEXT, greetMessage };
