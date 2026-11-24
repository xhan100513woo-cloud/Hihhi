package com.iris.assistant

import android.content.Context
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.zip.ZipInputStream

/** 호출어 감지용 오프라인 한국어 음성 모델(Vosk)을 내려받아 보관한다. */
object ModelManager {
    private const val URL_KO = "https://alphacephei.com/vosk/models/vosk-model-small-ko-0.22.zip"

    fun modelDir(ctx: Context) = File(ctx.filesDir, "vosk-ko")

    fun isReady(ctx: Context) = File(modelDir(ctx), "am/final.mdl").exists()

    /** 블로킹 호출. progress 는 0..100 */
    fun download(ctx: Context, progress: (Int) -> Unit) {
        val zip = File(ctx.cacheDir, "vosk-ko.zip")
        val conn = URL(URL_KO).openConnection() as HttpURLConnection
        conn.connectTimeout = 20000
        conn.readTimeout = 30000
        conn.instanceFollowRedirects = true
        try {
            if (conn.responseCode !in 200..299) error("모델 다운로드 실패: HTTP ${conn.responseCode}")
            val total = conn.contentLengthLong
            conn.inputStream.use { input ->
                zip.outputStream().use { out ->
                    val buf = ByteArray(64 * 1024)
                    var done = 0L
                    var last = -1
                    while (true) {
                        val n = input.read(buf)
                        if (n < 0) break
                        out.write(buf, 0, n)
                        done += n
                        if (total > 0) {
                            val p = (done * 90 / total).toInt()
                            if (p != last) { last = p; progress(p) }
                        }
                    }
                }
            }
        } finally {
            conn.disconnect()
        }

        val target = modelDir(ctx)
        val tmp = File(ctx.filesDir, "vosk-ko.tmp")
        tmp.deleteRecursively(); tmp.mkdirs()
        ZipInputStream(zip.inputStream().buffered()).use { zin ->
            while (true) {
                val e = zin.nextEntry ?: break
                // 최상위 폴더(vosk-model-small-ko-0.22/) 제거
                val rel = e.name.substringAfter('/', "")
                if (rel.isEmpty()) continue
                val f = File(tmp, rel)
                if (!f.canonicalPath.startsWith(tmp.canonicalPath)) continue
                if (e.isDirectory) f.mkdirs() else {
                    f.parentFile?.mkdirs()
                    f.outputStream().use { zin.copyTo(it) }
                }
            }
        }
        zip.delete()
        target.deleteRecursively()
        if (!tmp.renameTo(target)) error("모델 폴더 이동 실패")
        progress(100)
    }
}
