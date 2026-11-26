"use strict";
// 슬래시 명령어 정의
const pokemon = (o) => o.setName("포켓몬").setDescription("도감번호 또는 이름 (예: 6, 리자몽)").setRequired(true).setAutocomplete(true);
const form = (o) => o.setName("폼").setDescription("모습 번호(1=기본, 2부터 변화 모습) 또는 이름 (예: 2, 알로라, 메가)");
const { SlashCommandBuilder, PermissionFlagsBits, InteractionContextType } = require("discord.js");

module.exports = [
  new SlashCommandBuilder().setName("도감").setDescription("포켓몬 GO 정보: 타입, 약점·강점 속성, 최대 CP")
    .addStringOption(pokemon).addStringOption(form),
  new SlashCommandBuilder().setName("cp").setDescription("개체값과 레벨로 CP·HP·리그 레벨 계산")
    .addStringOption(pokemon)
    .addIntegerOption((o) => o.setName("공격").setDescription("공격 개체값 0~15").setMinValue(0).setMaxValue(15).setRequired(true))
    .addIntegerOption((o) => o.setName("방어").setDescription("방어 개체값 0~15").setMinValue(0).setMaxValue(15).setRequired(true))
    .addIntegerOption((o) => o.setName("체력").setDescription("체력 개체값 0~15").setMinValue(0).setMaxValue(15).setRequired(true))
    .addNumberOption((o) => o.setName("레벨").setDescription("1~51 (0.5 단위, 기본 40)").setMinValue(1).setMaxValue(51))
    .addStringOption(form),
  new SlashCommandBuilder().setName("개체").setDescription("게임에 표시된 CP(·HP)로 가능한 개체값 찾기")
    .addStringOption(pokemon)
    .addIntegerOption((o) => o.setName("cp").setDescription("게임에 표시된 CP").setMinValue(10).setRequired(true))
    .addIntegerOption((o) => o.setName("hp").setDescription("게임에 표시된 HP (선택, 입력 시 정확도↑)").setMinValue(10))
    .addIntegerOption((o) => o.setName("최소개체").setDescription("획득 방법별 최소 개체값").addChoices(
      { name: "0 (야생)", value: 0 }, { name: "1 (친구 교환)", value: 1 }, { name: "4 (날씨 부스트)", value: 4 },
      { name: "10 (레이드·알·연구)", value: 10 }, { name: "12 (최고의 친구 교환)", value: 12 }))
    .addStringOption(form),
  new SlashCommandBuilder().setName("배틀").setDescription("리그별 배틀 개체 순위 1~10위 (슈퍼·하이퍼·마스터·메가마스터)")
    .addStringOption(pokemon).addStringOption(form),
  new SlashCommandBuilder().setName("획득").setDescription("포켓몬 GO 획득 경로 (진화·알·둥지·레이드/리서치 전용·지역 한정 등)")
    .addStringOption(pokemon),
  new SlashCommandBuilder().setName("일정").setDescription("포켓몬 GO 일정 (현재 진행 중 / 다가오는 일정)")
    .addStringOption((o) => o.setName("종류").setDescription("현재 또는 다음 (기본: 현재)")
      .addChoices({ name: "현재 진행 중", value: "현재" }, { name: "다가오는 일정", value: "다음" })),
  new SlashCommandBuilder().setName("채널꾸미기").setDescription("(관리자) 채널 이름·설명·카테고리를 포켓몬 테마로 정리")
    .addBooleanOption((o) => o.setName("없는채널만들기").setDescription("서버에 없는 기능 채널을 새로 만들지 (기본: 만들지 않음)"))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .setContexts(InteractionContextType.Guild),
].map((c) => c.toJSON());
