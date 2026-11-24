package com.iris.assistant

import android.content.Context

/** 앱 설정 (API 키, 모델 등). 개인 기기용이라 SharedPreferences에 저장한다. */
class Prefs(context: Context) {
    private val sp = context.getSharedPreferences("iris", Context.MODE_PRIVATE)

    var apiKey: String
        get() = sp.getString("api_key", "") ?: ""
        set(v) = sp.edit().putString("api_key", v.trim()).apply()

    var model: String
        get() = sp.getString("model", DEFAULT_MODEL) ?: DEFAULT_MODEL
        set(v) = sp.edit().putString("model", v.trim().ifEmpty { DEFAULT_MODEL }).apply()

    /** 화면 켜고 끌 때 상관없이 부팅 후 자동 시작 */
    var autoStart: Boolean
        get() = sp.getBoolean("auto_start", true)
        set(v) = sp.edit().putBoolean("auto_start", v).apply()

    /** 루트 명령 실행 전 음성으로 확인받기 */
    var confirmDangerous: Boolean
        get() = sp.getBoolean("confirm_dangerous", true)
        set(v) = sp.edit().putBoolean("confirm_dangerous", v).apply()

    companion object {
        const val DEFAULT_MODEL = "claude-opus-5-5"
    }
}
