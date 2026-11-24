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
 * 오프라인(Vosk)으로 계속 듣다가 "아이리스" 가 들리면 onWake 를 호출한다.
 * 이 한국어 모델에는 [unk] 토큰이 없어서 문법 제한 대신 전체 받아쓰기를 하며 호출어를 찾는다.
 */
class WakeWordListener(
    private val model: Model,
    private val maxDistance: () -> Int,
    private val onHeard: (String) -> Unit,
    private val onWake: () -> Unit,
) {
    private var service: SpeechService? = null
    private val main = Handler(Looper.getMainLooper())

    val isRunning get() = service != null

    fun start() {
        if (service != null) return
        try {
            val rec = Recognizer(model, 16000f)
            val s = SpeechService(rec, 16000f)
            service = s
            s.startListening(object : org.vosk.android.RecognitionListener {
                override fun onPartialResult(hypothesis: String?) {
                    check(hypothesis, "partial")
                }
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
        if (isWakeWord(text, maxDistance())) {
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
        /**
         * 오프라인 모델은 "아이리스"를 "아이디스", "하이 리스크" 등으로 받아쓰는 경우가 많다.
         * 그래서 자모 단위 편집거리로 비슷한 발음을 찾는다. 시험 결과 호출은 거리 0~2, 일반 문장은 3 이상이었다.
         */
        fun isWakeWord(text: String, maxDistance: Int): Boolean = distance(text) <= maxDistance

        private val TARGET = jamo("아이리스")

        fun distance(text: String): Int {
            var best = Int.MAX_VALUE
            val candidates = listOf(text.replace(" ", "")) + text.split(' ').filter { it.isNotBlank() }
            for (w in candidates) {
                val j = jamo(w)
                for (len in TARGET.size - 1..TARGET.size + 1) {
                    if (j.size < len) { best = minOf(best, levenshtein(j, TARGET)); continue }
                    for (start in 0..j.size - len) best = minOf(best, levenshtein(j.subList(start, start + len), TARGET))
                }
            }
            return best
        }

        private const val CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ"
        private const val JUNG = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ"
        private const val JONG = " ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ"

        private fun jamo(s: String): List<Char> {
            val out = ArrayList<Char>()
            for (ch in s) {
                val c = ch.code - 0xAC00
                if (c !in 0 until 11172) continue
                out += CHO[c / 588]; out += JUNG[(c % 588) / 28]
                if (c % 28 != 0) out += JONG[c % 28]
            }
            return out
        }

        private fun levenshtein(a: List<Char>, b: List<Char>): Int {
            var prev = IntArray(b.size + 1) { it }
            for (i in 1..a.size) {
                val cur = IntArray(b.size + 1)
                cur[0] = i
                for (j in 1..b.size) {
                    cur[j] = minOf(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + if (a[i - 1] == b[j - 1]) 0 else 1)
                }
                prev = cur
            }
            return prev[b.size]
        }
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
