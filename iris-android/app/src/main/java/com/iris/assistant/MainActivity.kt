package com.iris.assistant

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Typeface
import android.net.Uri
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast

class MainActivity : Activity() {

    private lateinit var prefs: Prefs
    private lateinit var statusView: TextView
    private lateinit var logView: TextView
    private lateinit var toggle: Button

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = Prefs(this)
        setContentView(buildUi())
        requestPermissionsIfNeeded()

        if (intent.getBooleanExtra(EXTRA_AUTOSTART, false)) {
            if (hasMic()) IrisService.start(this)
            moveTaskToBack(true)
        }
    }

    override fun onResume() {
        super.onResume()
        IrisService.listener = { refresh() }
        refresh()
    }

    override fun onPause() {
        IrisService.listener = null
        super.onPause()
    }

    private fun refresh() {
        statusView.text = "상태: ${IrisService.lastStatus}"
        toggle.text = if (IrisService.running) "아이리스 끄기" else "아이리스 켜기"
        logView.text = synchronized(IrisService.logLines) { IrisService.logLines.takeLast(20).joinToString("\n\n") }
    }

    private fun buildUi(): View {
        val pad = (16 * resources.displayMetrics.density).toInt()
        val col = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, pad * 2, pad, pad)
        }
        fun label(t: String, size: Float = 14f, bold: Boolean = false) = TextView(this).apply {
            text = t; textSize = size; setTextColor(Color.parseColor("#222222"))
            if (bold) typeface = Typeface.DEFAULT_BOLD
            setPadding(0, pad / 2, 0, pad / 4)
        }.also { col.addView(it) }

        label("아이리스", 28f, true)
        label("화면이 꺼져 있어도 \"아이리스\"라고 부르면 대답해요.", 14f)

        statusView = label("상태: -", 15f, true)
        toggle = Button(this).apply {
            setOnClickListener {
                if (IrisService.running) IrisService.stop(this@MainActivity)
                else if (!hasMic()) requestPermissionsIfNeeded()
                else if (prefs.apiKey.isBlank()) Toast.makeText(this@MainActivity, "먼저 API 키를 저장하세요", Toast.LENGTH_LONG).show()
                else IrisService.start(this@MainActivity)
                it.postDelayed({ refresh() }, 500)
            }
        }
        col.addView(toggle)

        label("Claude API 키", 14f, true)
        val keyEdit = EditText(this).apply {
            hint = "sk-ant-..."
            setText(prefs.apiKey)
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
        }
        col.addView(keyEdit)
        label("모델 (기본 ${Prefs.DEFAULT_MODEL}, 더 빠르고 싸게: claude-haiku-5-5)", 13f)
        val modelEdit = EditText(this).apply { setText(prefs.model); isSingleLine = true }
        col.addView(modelEdit)

        val confirm = CheckBox(this).apply {
            text = "루트 명령 실행 전에 음성으로 확인받기"
            isChecked = prefs.confirmDangerous
            setOnCheckedChangeListener { _, c -> prefs.confirmDangerous = c }
        }
        col.addView(confirm)
        val auto = CheckBox(this).apply {
            text = "휴대폰 켜지면 자동 시작"
            isChecked = prefs.autoStart
            setOnCheckedChangeListener { _, c -> prefs.autoStart = c }
        }
        col.addView(auto)

        col.addView(Button(this).apply {
            text = "설정 저장"
            setOnClickListener {
                prefs.apiKey = keyEdit.text.toString()
                prefs.model = modelEdit.text.toString()
                Toast.makeText(this@MainActivity, "저장했어요", Toast.LENGTH_SHORT).show()
            }
        })
        col.addView(Button(this).apply {
            text = "배터리 최적화에서 제외 (꼭 해 주세요)"
            setOnClickListener { requestBatteryExemption() }
        })

        label("글자로 시험해 보기", 14f, true)
        val testEdit = EditText(this).apply { hint = "예: 내일 오후 3시에 치과 예약 잡아줘" }
        col.addView(testEdit)
        col.addView(Button(this).apply {
            text = "보내기"
            setOnClickListener {
                val t = testEdit.text.toString().trim()
                if (t.isEmpty()) return@setOnClickListener
                if (!IrisService.running) {
                    Toast.makeText(this@MainActivity, "먼저 아이리스를 켜 주세요", Toast.LENGTH_SHORT).show()
                    return@setOnClickListener
                }
                startService(Intent(this@MainActivity, IrisService::class.java)
                    .setAction(IrisService.ACTION_TEXT).putExtra(IrisService.EXTRA_TEXT, t))
                testEdit.setText("")
            }
        })

        label("최근 대화", 14f, true)
        logView = label("", 14f)
        logView.gravity = Gravity.START

        return ScrollView(this).apply {
            setBackgroundColor(Color.parseColor("#F7F6FF"))
            addView(col)
        }
    }

    private fun hasMic() = checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED

    private fun requestPermissionsIfNeeded() {
        val wanted = mutableListOf(
            Manifest.permission.RECORD_AUDIO,
            Manifest.permission.READ_CALENDAR,
            Manifest.permission.WRITE_CALENDAR,
        )
        if (android.os.Build.VERSION.SDK_INT >= 33) wanted += Manifest.permission.POST_NOTIFICATIONS
        val missing = wanted.filter { checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED }
        if (missing.isNotEmpty()) requestPermissions(missing.toTypedArray(), 1)
    }

    private fun requestBatteryExemption() {
        val pm = getSystemService(PowerManager::class.java)
        if (pm.isIgnoringBatteryOptimizations(packageName)) {
            Toast.makeText(this, "이미 제외되어 있어요", Toast.LENGTH_SHORT).show()
            return
        }
        try {
            startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName")))
        } catch (_: Exception) {
            startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
        }
    }

    companion object {
        const val EXTRA_AUTOSTART = "autostart"
    }
}
