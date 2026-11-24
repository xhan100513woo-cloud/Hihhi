package com.iris.assistant

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioManager
import android.media.ToneGenerator
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.util.Log
import org.vosk.LibVosk
import org.vosk.LogLevel
import org.vosk.Model
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * 화면이 꺼져 있어도 계속 실행되는 포그라운드 서비스.
 * 대기(호출어 감지) → 명령 듣기 → Claude 처리 → 음성 답변 → 다시 대기.
 */
class IrisService : Service() {

    private val main = Handler(Looper.getMainLooper())
    private val worker = Executors.newSingleThreadExecutor()
    private lateinit var prefs: Prefs
    private lateinit var speaker: Speaker
    private lateinit var gemini: GeminiAgent
    private lateinit var claude: ClaudeAgent
    private val agent: Assistant get() = if (prefs.provider == Prefs.PROVIDER_CLAUDE) claude else gemini
    private var model: Model? = null
    private var wake: WakeWordListener? = null
    private var command: CommandListener? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private var busy = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        running = true
        prefs = Prefs(this)
        speaker = Speaker(this)
        val tools = PhoneTools(this, prefs, ::confirmByVoice)
        gemini = GeminiAgent(prefs, tools)
        claude = ClaudeAgent(prefs, tools)
        createChannel()
        startInForeground("준비 중…")

        wakeLock = getSystemService(PowerManager::class.java)
            .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Iris::listen").apply {
                setReferenceCounted(false); acquire()
            }

        worker.execute {
            // 루트가 있으면 도즈(절전)에서 제외해 화면이 꺼져도 죽지 않게 한다
            if (Root.available()) Root.run("dumpsys deviceidle whitelist +$packageName", 15)
            try {
                LibVosk.setLogLevel(LogLevel.WARNINGS)
                if (!ModelManager.isReady(this)) {
                    status("음성 모델 내려받는 중…")
                    ModelManager.download(this) { p -> status("음성 모델 내려받는 중… $p%") }
                }
                val m = Model(ModelManager.modelDir(this).absolutePath)
                main.post {
                    model = m
                    wake = WakeWordListener(m) { onWakeWord() }
                    command = CommandListener(this, m)
                    startWaiting()
                }
            } catch (e: Exception) {
                Log.e(TAG, "model load failed", e)
                status("음성 모델 오류: ${e.message}")
            }
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> { stopSelf(); return START_NOT_STICKY }
            ACTION_TEXT -> intent.getStringExtra(EXTRA_TEXT)?.let { main.post { handleCommand(it) } }
            ACTION_LISTEN -> main.post { if (!busy && model != null) onWakeWord() }
        }
        return START_STICKY
    }

    override fun onDestroy() {
        running = false
        wake?.stop(); command?.cancel()
        speaker.shutdown()
        worker.shutdownNow()
        model?.close()
        wakeLock?.release()
        status("꺼짐")
        super.onDestroy()
    }

    // ---------------- 흐름 ----------------

    private fun startWaiting() {
        busy = false
        command?.cancel()
        wake?.start()
        status("대기 중 — \"아이리스\"라고 불러 주세요")
    }

    private fun onWakeWord() {
        busy = true
        wake?.stop()
        beep()
        status("듣는 중…")
        main.postDelayed({ listenCommand() }, 250)
    }

    private fun listenCommand() {
        command?.listen { text ->
            when {
                text == null -> speaker.speak("잘 못 들었어요.") { startWaiting() }
                isCancel(text) -> speaker.speak("네.") { startWaiting() }
                else -> handleCommand(text)
            }
        } ?: startWaiting()
    }

    private fun handleCommand(text: String) {
        busy = true
        wake?.stop()
        val cleaned = text.replace(Regex("^\\s*아이\\s?리스[야아,\\s]*"), "").ifBlank { text }
        log("나: $cleaned")
        status("생각 중… \"$cleaned\"")
        worker.execute {
            val answer = agent.ask(cleaned)
            main.post {
                log("아이리스: $answer")
                status("말하는 중…")
                speaker.speak(answer) {
                    // 되묻는 질문이면 호출어 없이 바로 대답을 듣는다
                    if (answer.trim().endsWith("?")) { beep(); status("듣는 중…"); listenCommand() }
                    else startWaiting()
                }
            }
        }
    }

    /** PhoneTools 가 작업 스레드에서 호출. 음성으로 묻고 "응/네" 를 기다린다. */
    private fun confirmByVoice(question: String): Boolean {
        val latch = CountDownLatch(1)
        var yes = false
        main.post {
            log("아이리스(확인): $question")
            status("확인 중… $question")
            speaker.speak(question) {
                beep()
                command?.listen { t ->
                    log("나: ${t ?: "(못 알아들음)"}")
                    yes = t != null && isYes(t)
                    latch.countDown()
                } ?: latch.countDown()
            }
        }
        latch.await(60, TimeUnit.SECONDS)
        main.post { status("생각 중…") }
        return yes
    }

    private fun isYes(t: String): Boolean {
        val s = t.replace(" ", "")
        if (listOf("아니", "안돼", "하지마", "취소", "싫어", "됐어", "노").any { s.contains(it) }) return false
        return listOf("응", "네", "예", "그래", "좋아", "해줘", "해", "어", "오케이", "ok", "맞아", "부탁").any { s.contains(it, true) }
    }

    private fun isCancel(t: String) = t.replace(" ", "").let { it == "취소" || it == "됐어" || it == "아니야" || it == "아무것도아니야" }

    private fun beep() {
        try {
            ToneGenerator(AudioManager.STREAM_MUSIC, 70).apply {
                startTone(ToneGenerator.TONE_PROP_BEEP, 150)
                main.postDelayed({ release() }, 400)
            }
        } catch (_: Exception) {}
    }

    // ---------------- 알림/상태 ----------------

    private fun createChannel() {
        val ch = NotificationChannel(CHANNEL, "아이리스 대기", NotificationManager.IMPORTANCE_LOW)
        ch.setShowBadge(false)
        getSystemService(NotificationManager::class.java).createNotificationChannel(ch)
    }

    private fun buildNotification(text: String): Notification {
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val listen = PendingIntent.getService(this, 1, Intent(this, IrisService::class.java).setAction(ACTION_LISTEN),
            PendingIntent.FLAG_IMMUTABLE)
        val stop = PendingIntent.getService(this, 2, Intent(this, IrisService::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_IMMUTABLE)
        return Notification.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_mic)
            .setContentTitle("아이리스")
            .setContentText(text)
            .setContentIntent(open)
            .setOngoing(true)
            .addAction(Notification.Action.Builder(null, "지금 말하기", listen).build())
            .addAction(Notification.Action.Builder(null, "끄기", stop).build())
            .build()
    }

    private fun startInForeground(text: String) {
        val n = buildNotification(text)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q)
            startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
        else startForeground(NOTIF_ID, n)
    }

    private fun status(text: String) {
        main.post {
            lastStatus = text
            if (running) getSystemService(NotificationManager::class.java).notify(NOTIF_ID, buildNotification(text))
            listener?.invoke()
        }
    }

    private fun log(line: String) {
        synchronized(logLines) {
            logLines += line
            while (logLines.size > 50) logLines.removeAt(0)
        }
        main.post { listener?.invoke() }
    }

    companion object {
        private const val TAG = "Iris"
        private const val CHANNEL = "iris"
        private const val NOTIF_ID = 1
        const val ACTION_STOP = "com.iris.STOP"
        const val ACTION_TEXT = "com.iris.TEXT"
        const val ACTION_LISTEN = "com.iris.LISTEN"
        const val EXTRA_TEXT = "text"

        @Volatile var running = false
        @Volatile var lastStatus = "꺼짐"
        val logLines = mutableListOf<String>()
        /** 화면(MainActivity) 갱신용 */
        var listener: (() -> Unit)? = null

        fun start(ctx: Context) {
            ctx.startForegroundService(Intent(ctx, IrisService::class.java))
        }

        fun stop(ctx: Context) {
            ctx.stopService(Intent(ctx, IrisService::class.java))
        }
    }
}
