"use strict";
// 채널별로 어떤 기능이 반응할지 결정
//  - 배틀신청 채널   : 배틀신청 / 배틀신청 확인 / 배틀신청 수락 / 배틀 종료
//  - 포켓몬개체정보방 : 도감번호 또는 이름 (111, 888-2, 리자몽, 자시안-2)
//  - 배틀개체정보방   : 배틀 도감번호 (배틀111, 배틀888-2)
//  - 포켓몬획득정보방 : 도감번호 또는 이름 → 획득 경로
//  - 포켓몬고일정     : 현재일정 / 다음일정
//  - 친코등록         : 친코등록 12자리 / 친코확인 닉네임
//  - 내위치           : 내위치 → 1회용 위치 링크
const P = require("./pogo");
const BR = require("./battle-request");
const { parseScheduleCommand } = require("./schedule");
const { parseFriendCommand } = require("./friendcode");
const { isLocationCommand } = require("./location");

/**
 * @returns {{kind:"battleCmd",cmd}|{kind:"pvp",q}|{kind:"acq",q}|{kind:"dex",q}|null}
 */
function routeMessage(channel, content, { dex, pvp, battle, acq = [], schedule = [], friend = [], location = [] }) {
  if (P.channelMatches(channel, location) && isLocationCommand(content)) return { kind: "location" };
  if (P.channelMatches(channel, friend)) {
    const cmd = parseFriendCommand(content);
    if (cmd) return { kind: "friend", cmd };
  }
  if (P.channelMatches(channel, schedule)) {
    const mode = parseScheduleCommand(content);
    if (mode) return { kind: "schedule", mode };
  }
  if (P.channelMatches(channel, battle)) {
    const cmd = BR.parseBattleCommand(content);
    if (cmd) return { kind: "battleCmd", cmd };
  }
  if (P.channelMatches(channel, pvp)) {
    const q = P.parseBattle(content);
    if (q) return { kind: "pvp", q };
  }
  if (P.channelMatches(channel, acq)) {
    const q = P.parseDexQuery(content) || P.parseNameQuery(content);
    if (q) return { kind: "acq", q };
  }
  if (P.channelMatches(channel, dex)) {
    const q = P.parseDexQuery(content) || P.parseNameQuery(content);
    if (q) return { kind: "dex", q };
  }
  return null;
}

module.exports = { routeMessage };
