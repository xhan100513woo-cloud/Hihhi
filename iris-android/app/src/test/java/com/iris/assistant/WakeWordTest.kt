package com.iris.assistant

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** 실제 Vosk 한국어 모델이 받아쓴 결과로 만든 테스트 */
class WakeWordTest {
    private val wake = listOf("아이디스 냐", "아이디스 지금 몇시 냐", "아이디스 알란 마쳐 여", "이 부화 이 리스", "아이리스 말씨 알려 채워", "하이 리스크")
    private val other = listOf(
        "아이스크림 먹고 싶다", "아이들이 학교 의 갔어요", "오늘 회의는 세실 있어요", "와 서 이것 거점화",
        "리스트를 점유 해 주세요", "아이고 허리 야", "아이디 비밀번호 를 기 서벌 이었어", "하이 반가와",
        "에어컨 좀 셔츠와", "아이폰 새로 사 왔어", "크리스마스 에 뭐할 거야", "아이디 가 아니다",
        "나 이 즉 페이퍼", "전역에 치킨 시켜먹 자", "다이어리 어디 있어",
    )

    @Test fun detectsWakeWord() = wake.forEach { assertTrue(it, WakeWordListener.isWakeWord(it, 2)) }
    @Test fun ignoresOtherSpeech() = other.forEach { assertFalse(it, WakeWordListener.isWakeWord(it, 2)) }
}
