package com.iris.assistant

import java.io.File
import java.util.concurrent.TimeUnit

/** su 를 통해 루트 셸 명령을 실행한다. */
object Root {
    data class Result(val code: Int, val out: String, val err: String) {
        val ok get() = code == 0
        fun summary(max: Int = 3000): String {
            val text = buildString {
                append("exit=").append(code)
                if (out.isNotBlank()) append("\nstdout:\n").append(out.trim())
                if (err.isNotBlank()) append("\nstderr:\n").append(err.trim())
            }
            return if (text.length > max) text.take(max) + "\n...(생략)" else text
        }
    }

    @Volatile private var cachedAvailable: Boolean? = null

    fun available(): Boolean {
        cachedAvailable?.let { return it }
        val ok = try { run("id", 10).out.contains("uid=0") } catch (_: Exception) { false }
        cachedAvailable = ok
        return ok
    }

    fun run(command: String, timeoutSec: Long = 120): Result {
        val p = ProcessBuilder("su", "-c", command).start()
        val outT = StreamReader(p.inputStream.bufferedReader()).also { it.start() }
        val errT = StreamReader(p.errorStream.bufferedReader()).also { it.start() }
        val finished = p.waitFor(timeoutSec, TimeUnit.SECONDS)
        if (!finished) {
            p.destroyForcibly()
            return Result(-1, outT.text(), "시간 초과(${timeoutSec}초)")
        }
        outT.join(2000); errT.join(2000)
        return Result(p.exitValue(), outT.text(), errT.text())
    }

    /** 일반 앱 권한으로 쓸 수 없는 위치에 파일을 복사한 뒤 설치한다. */
    fun installApk(apk: File): Result {
        val tmp = "/data/local/tmp/iris_install.apk"
        return run("cp '${apk.absolutePath}' $tmp && chmod 644 $tmp && pm install -r -g $tmp; r=\$?; rm -f $tmp; exit \$r", 300)
    }

    fun shellQuote(s: String) = "'" + s.replace("'", "'\\''") + "'"

    private class StreamReader(private val r: java.io.BufferedReader) : Thread() {
        private val sb = StringBuilder()
        override fun run() {
            try { r.forEachLine { synchronized(sb) { sb.appendLine(it) } } } catch (_: Exception) {}
        }
        fun text() = synchronized(sb) { sb.toString() }
    }
}
