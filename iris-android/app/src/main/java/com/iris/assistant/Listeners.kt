package com.iris.assistant

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.util.Log
import org.json.JSONObject
import org.vosk.Model
import org.vosk.Recognizer
import org.vosk.android.SpeechService

private const val TAG = "Iris"

/**
 * 오프라인(Vosk)으로 계속 듣다가 "민규" 가 들리면 onWake 를 호출한다.
 *
 * "민규"는 두 글자라 그냥 받아쓰기로는 "민국", "민수", "인규" 같은 말과 구별이 안 된다.
 * 그래서 문법 모드를 쓴다: 호출어와 비슷한 단어를 포함한 약 4천 개의 짧은 단어(assets/wake_distractors.txt)
 * 중에서만 고르게 하면, 진짜 "민규"일 때만 호출어 단어가 선택된다.
 * (합성 음성 시험: 호출 7/7 감지, 일반 문장 18개 오감지 0)
 */
class WakeWordListener(
    context: Context,
    model: Model,
    private val onHeard: (String) -> Unit,
    private val onWake: () -> Unit,
) {
    private var service: SpeechService? = null
    private val main = Handler(Looper.getMainLooper())
    private val recognizer: Recognizer

    init {
        val distractors = context.assets.open("wake_distractors.txt").bufferedReader().readLines()
            .map { it.trim() }.filter { it.isNotEmpty() && it !in WAKE_WORDS }
        val grammar = org.json.JSONArray(WAKE_WORDS + distractors).toString()
        recognizer = Recognizer(model, 16000f, grammar)
    }

    val isRunning get() = service != null

    fun start() {
        if (service != null) return
        try {
            recognizer.reset()
            val s = SpeechService(recognizer, 16000f)
            service = s
            s.startListening(object : org.vosk.android.RecognitionListener {
                override fun onPartialResult(hypothesis: String?) { check(hypothesis, "partial") }
                override fun onResult(hypothesis: String?) { check(hypothesis, "text") }
                override fun onFinalResult(hypothesis: String?) { check(hypothesis, "text") }
                override fun onError(e: Exception?) {
                    Log.w(TAG, "vosk error", e)
                    stop()
                    main.postDelayed({ start() }, 2000)
                }
                override fun onTimeout() {}
            })
        } catch (e: Exception) {
            Log.e(TAG, "wake start failed", e)
            service = null
            main.postDelayed({ start() }, 3000)
        }
    }

    private fun check(json: String?, key: String) {
        if (json == null || service == null) return
        val text = try { JSONObject(json).optString(key) } catch (_: Exception) { "" }
        if (text.isEmpty()) return
        onHeard(text)
        if (isWakeWord(text)) {
            Log.i(TAG, "wake word: $text")
            stop()
            main.post(onWake)
        }
    }

    fun stop() {
        service?.let {
            try { it.stop(); it.shutdown() } catch (_: Exception) {}
        }
        service = null
    }

    companion object {
        /** 문법 모드 출력에서 호출어로 인정할 단어. "민균"은 "민규"가 자주 이렇게 인식돼서 포함 */
        val WAKE_WORDS = listOf("민규", "민균")

        fun isWakeWord(text: String) = text.split(' ').any { it in WAKE_WORDS }
    }
}

/**
 * 호출 뒤 명령 한 문장을 받아쓴다. 구글 음성인식(SpeechRecognizer)이 있으면 그것을 쓰고,
 * 없으면 Vosk 받아쓰기로 대신한다. onText(null) = 못 알아들음.
 */
class CommandListener(private val context: Context, private val model: Model?) {
    private val main = Handler(Looper.getMainLooper())
    private var recognizer: SpeechRecognizer? = null
    private var vosk: SpeechService? = null
    private var timeout: Runnable? = null

    fun listen(onText: (String?) -> Unit) {
        cancel()
        if (SpeechRecognizer.isRecognitionAvailable(context)) listenGoogle(onText)
        else listenVosk(onText)
    }

    private fun listenGoogle(onText: (String?) -> Unit) {
        val r = SpeechRecognizer.createSpeechRecognizer(context)
        recognizer = r
        var delivered = false
        fun deliver(t: String?) {
            if (delivered) return
            delivered = true
            cancel()
            onText(t)
        }
        r.setRecognitionListener(object : RecognitionListener {
            override fun onResults(results: Bundle?) {
                val list = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                deliver(list?.firstOrNull()?.takeIf { it.isNotBlank() })
            }
            override fun onError(error: Int) {
                Log.w(TAG, "SpeechRecognizer error $error")
                // 클라이언트/서비스 오류면 Vosk 로 한 번 더 시도
                if (!delivered && model != null &&
                    (error == SpeechRecognizer.ERROR_CLIENT || error == SpeechRecognizer.ERROR_RECOGNIZER_BUSY ||
                        error == SpeechRecognizer.ERROR_SERVER || error == SpeechRecognizer.ERROR_NETWORK)
                ) {
                    delivered = true
                    cancel()
                    listenVosk(onText)
                } else deliver(null)
            }
            override fun onReadyForSpeech(params: Bundle?) {}
            override fun onBeginningOfSpeech() {}
            override fun onRmsChanged(rmsdB: Float) {}
            override fun onBufferReceived(buffer: ByteArray?) {}
            override fun onEndOfSpeech() {}
            override fun onPartialResults(partialResults: Bundle?) {}
            override fun onEvent(eventType: Int, params: Bundle?) {}
        })
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, "ko-KR")
            putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, context.packageName)
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
            putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 1500L)
        }
        r.startListening(intent)
        timeout = Runnable { deliver(null) }.also { main.postDelayed(it, 15000) }
    }

    private fun listenVosk(onText: (String?) -> Unit) {
        val m = model ?: return onText(null)
        try {
            val s = SpeechService(Recognizer(m, 16000f), 16000f)
            vosk = s
            var delivered = false
            fun deliver(t: String?) {
                if (delivered) return
                delivered = true
                main.post { cancel(); onText(t) }
            }
            s.startListening(object : org.vosk.android.RecognitionListener {
                override fun onPartialResult(hypothesis: String?) {}
                override fun onResult(hypothesis: String?) {
                    val t = hypothesis?.let { JSONObject(it).optString("text") }.orEmpty()
                    if (t.isNotBlank()) deliver(t)
                }
                override fun onFinalResult(hypothesis: String?) { onResult(hypothesis) }
                override fun onError(e: Exception?) { deliver(null) }
                override fun onTimeout() { deliver(null) }
            }, 10000)
        } catch (e: Exception) {
            Log.e(TAG, "vosk command failed", e)
            onText(null)
        }
    }

    fun cancel() {
        timeout?.let { main.removeCallbacks(it) }
        timeout = null
        recognizer?.let { try { it.cancel(); it.destroy() } catch (_: Exception) {} }
        recognizer = null
        vosk?.let { try { it.stop(); it.shutdown() } catch (_: Exception) {} }
        vosk = null
    }
}
