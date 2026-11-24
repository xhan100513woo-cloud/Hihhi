package com.iris.assistant

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * 부팅 후 자동 시작. 안드로이드 11+ 에서는 백그라운드에서 마이크 서비스를 바로 켤 수 없어서,
 * 루트로 화면(MainActivity)을 잠깐 띄워 그 안에서 서비스를 시작한다.
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (!Prefs(context).autoStart) return
        val pending = goAsync()
        Thread {
            try {
                val cmd = "am start -n ${context.packageName}/.MainActivity --ez ${MainActivity.EXTRA_AUTOSTART} true"
                if (!(Root.available() && Root.run(cmd, 20).ok)) {
                    try { IrisService.start(context) } catch (_: Exception) {}
                }
            } finally {
                pending.finish()
            }
        }.start()
    }
}
