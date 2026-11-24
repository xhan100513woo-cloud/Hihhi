package com.iris.assistant

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** 실제 Vosk 한국어 모델(문법 모드)이 낸 출력으로 만든 테스트 */
class WakeWordTest {
    @Test fun detectsWakeWord() = listOf("민규 지급 녂 쉬안", "민규 안잤 미쳐 죄어", "민균 잘쓸 한류 크어", "민규")
        .forEach { assertTrue(it, WakeWordListener.isWakeWord(it)) }

    @Test fun ignoresOtherSpeech() = listOf("민구 기여 었기 갔었", "윤균 형기 화신 선더", "민 제아 밥 벅찼", "대악 민국 마테", "민숙 즙액 믹서")
        .forEach { assertFalse(it, WakeWordListener.isWakeWord(it)) }
}
