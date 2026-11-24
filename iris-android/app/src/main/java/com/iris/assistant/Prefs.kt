package com.iris.assistant

import android.content.Context

/** 앱 설정 (API 키, 모델 등). 개인 기기용이라 SharedPreferences에 저장한다. */
class Prefs(context: Context) {
    private val sp = context.getSharedPreferences("iris", Context.MODE_PRIVATE)

    /** "gemini" 또는 "claude" */
    var provider: String
        get() = sp.getString("provider", PROVIDER_GEMINI) ?: PROVIDER_GEMINI
        set(v) = sp.edit().putString("provider", v).apply()

    var geminiKey: String
        get() = sp.getString("gemini_key", "") ?: ""
        set(v) = sp.edit().putString("gemini_key", v.trim()).apply()

    var geminiModel: String
        get() = sp.getString("gemini_model", DEFAULT_GEMINI_MODEL) ?: DEFAULT_GEMINI_MODEL
        set(v) = sp.edit().putString("gemini_model", v.trim().ifEmpty { DEFAULT_GEMINI_MODEL }).apply()

    var claudeKey: String
        get() = sp.getString("api_key", "") ?: ""
        set(v) = sp.edit().putString("api_key", v.trim()).apply()

    var claudeModel: String
        get() = sp.getString("model", DEFAULT_CLAUDE_MODEL) ?: DEFAULT_CLAUDE_MODEL
        set(v) = sp.edit().putString("model", v.trim().ifEmpty { DEFAULT_CLAUDE_MODEL }).apply()

    /** 선택한 AI 의 키가 들어 있는지 */
    val hasKey get() = if (provider == PROVIDER_GEMINI) geminiKey.isNotBlank() else claudeKey.isNotBlank()

    /** 화면 켜고 끌 때 상관없이 부팅 후 자동 시작 */
    var autoStart: Boolean
        get() = sp.getBoolean("auto_start", true)
        set(v) = sp.edit().putBoolean("auto_start", v).apply()

    /** 호출어 민감도: 허용하는 발음 차이(자모 편집거리). 2=잘 알아들음(기본), 1=덜 민감 */
    var wakeDistance: Int
        get() = sp.getInt("wake_distance", 2)
        set(v) = sp.edit().putInt("wake_distance", v).apply()

    /** 루트 명령 실행 전 음성으로 확인받기 */
    var confirmDangerous: Boolean
        get() = sp.getBoolean("confirm_dangerous", true)
        set(v) = sp.edit().putBoolean("confirm_dangerous", v).apply()

    companion object {
        const val PROVIDER_GEMINI = "gemini"
        const val PROVIDER_CLAUDE = "claude"
        const val DEFAULT_GEMINI_MODEL = "gemini-3.8-flash"
        const val DEFAULT_CLAUDE_MODEL = "claude-opus-5-5"
    }
}
