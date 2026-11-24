package com.iris.assistant

import android.content.Context
import android.media.AudioAttributes
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger

/** 한국어 TTS. speak() 의 onDone 은 메인 스레드에서 호출된다. */
class Speaker(context: Context) {
    private val main = Handler(Looper.getMainLooper())
    private val callbacks = ConcurrentHashMap<String, () -> Unit>()
    private val ids = AtomicInteger()
    private var ready = false
    private val pending = mutableListOf<Pair<String, () -> Unit>>()

    private val tts: TextToSpeech = TextToSpeech(context.applicationContext) { status ->
        main.post {
            ready = status == TextToSpeech.SUCCESS
            if (ready) {
                tts.language = Locale.KOREAN
                tts.setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ASSISTANT)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                        .build()
                )
            }
            val list = pending.toList(); pending.clear()
            list.forEach { (t, cb) -> speak(t, cb) }
        }
    }

    init {
        tts.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(id: String) {}
            override fun onDone(id: String) { finish(id) }
            @Deprecated("deprecated in API") override fun onError(id: String) { finish(id) }
            override fun onError(id: String, errorCode: Int) { finish(id) }
            override fun onStop(id: String, interrupted: Boolean) { finish(id) }
        })
    }

    private fun finish(id: String) {
        callbacks.remove(id)?.let { cb -> main.post(cb) }
    }

    fun speak(text: String, onDone: () -> Unit = {}) {
        if (!ready) {
            pending += text to onDone
            return
        }
        val id = "u" + ids.incrementAndGet()
        callbacks[id] = onDone
        val r = tts.speak(cleanForSpeech(text), TextToSpeech.QUEUE_FLUSH, Bundle(), id)
        if (r != TextToSpeech.SUCCESS) finish(id)
    }

    fun stop() {
        tts.stop()
        callbacks.keys.toList().forEach { finish(it) }
    }

    fun shutdown() {
        tts.stop(); tts.shutdown()
    }

    /** 마크다운 기호 등 읽으면 어색한 문자를 제거 */
    private fun cleanForSpeech(s: String) = s
        .replace(Regex("[*#`_>|]"), "")
        .replace(Regex("\\[(.*?)]\\(.*?\\)"), "$1")
        .replace(Regex("https?://\\S+"), "링크")
        .trim()
}
