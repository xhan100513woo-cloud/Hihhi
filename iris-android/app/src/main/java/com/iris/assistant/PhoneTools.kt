package com.iris.assistant

import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.BatteryManager
import android.provider.AlarmClock
import android.provider.CalendarContract
import android.util.Log
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.TimeZone

/** 위험한 작업 전에 사용자에게 "할까요?" 를 묻고 대답을 기다린다(블로킹). */
fun interface Confirmer {
    fun confirm(question: String): Boolean
}

/** AI 종류와 무관한 도구 정의. props 는 JSON Schema 조각. */
data class ToolSpec(
    val name: String,
    val description: String,
    val props: Map<String, Map<String, Any>>,
    val required: List<String>,
)

/** AI 가 쓸 수 있는 휴대폰 기능들(도구). */
class PhoneTools(private val ctx: Context, private val prefs: Prefs, private val confirmer: Confirmer) {

    private val zone: ZoneId get() = ZoneId.systemDefault()
    private val fmt = DateTimeFormatter.ofPattern("yyyy-MM-dd(E) HH:mm")

    val specs: List<ToolSpec> = listOf(
        tool(
            "create_calendar_event",
            "휴대폰 기본 캘린더(삼성 캘린더/구글 캘린더)에 일정을 추가한다. 시간은 기기 현지 시각 ISO 형식(예: 2026-11-25T15:00).",
            mapOf(
                "title" to str("일정 제목"),
                "start" to str("시작 시각 ISO, 종일 일정이면 날짜만(2026-11-25)"),
                "end" to str("종료 시각 ISO. 생략하면 시작 후 1시간"),
                "all_day" to bool("종일 일정 여부"),
                "location" to str("장소"),
                "description" to str("메모"),
                "reminder_minutes" to int("몇 분 전에 알림. 기본 10"),
            ),
            listOf("title", "start"),
        ),
        tool(
            "list_calendar_events",
            "기간 안의 캘린더 일정을 조회한다.",
            mapOf("start" to str("조회 시작 ISO 날짜/시각"), "end" to str("조회 끝 ISO 날짜/시각")),
            listOf("start", "end"),
        ),
        tool(
            "delete_calendar_event",
            "list_calendar_events 로 얻은 event_id 의 일정을 삭제한다.",
            mapOf("event_id" to int("일정 ID")),
            listOf("event_id"),
        ),
        tool(
            "set_alarm",
            "시계 앱에 알람을 맞춘다.",
            mapOf(
                "hour" to int("0-23"), "minute" to int("0-59"), "label" to str("알람 이름"),
                "days" to mapOf("type" to "array", "items" to mapOf("type" to "integer"),
                    "description" to "반복 요일. 1=일 2=월 3=화 4=수 5=목 6=금 7=토. 생략하면 한 번만"),
            ),
            listOf("hour", "minute"),
        ),
        tool(
            "set_timer",
            "타이머를 맞춘다.",
            mapOf("seconds" to int("타이머 길이(초)"), "label" to str("타이머 이름")),
            listOf("seconds"),
        ),
        tool(
            "list_apps",
            "설치된 앱을 이름/패키지명으로 검색한다. query 를 비우면 사용자 앱 전체.",
            mapOf("query" to str("검색어(앱 이름 일부, 예: 카카오)")),
            emptyList(),
        ),
        tool("open_app", "앱을 실행한다.", mapOf("package" to str("패키지명")), listOf("package")),
        tool(
            "install_apk_from_url",
            "APK 파일 주소를 받아 내려받고 루트 권한으로 조용히 설치한다. 출처가 확실한 주소만 사용.",
            mapOf("url" to str("https://... .apk 직접 다운로드 주소"), "app_name" to str("설치할 앱 이름(확인 질문용)")),
            listOf("url"),
        ),
        tool(
            "open_play_store",
            "플레이스토어에서 앱 페이지(패키지명) 또는 검색 결과(검색어)를 연다. 플레이스토어 앱 설치는 사용자가 화면에서 '설치'를 눌러야 한다.",
            mapOf("package" to str("패키지명"), "query" to str("검색어")),
            emptyList(),
        ),
        tool("uninstall_app", "앱을 삭제한다(루트).", mapOf("package" to str("패키지명")), listOf("package")),
        tool(
            "run_root_command",
            "안드로이드 루트 셸(su)에서 명령을 실행하고 결과를 돌려준다. settings, am, pm, input, svc, dumpsys, cmd 등으로 " +
                "와이파이/블루투스/밝기/음량 조절, 앱 강제종료, 파일 확인 등 다른 도구로 안 되는 일을 처리한다. " +
                "되돌리기 어려운 명령(rm -rf, 포맷, 시스템 파일 수정 등)은 하지 말 것.",
            mapOf("command" to str("실행할 셸 명령"), "reason" to str("사용자에게 확인받을 때 읽어줄 짧은 설명")),
            listOf("command"),
        ),
        tool("get_device_status", "배터리, 충전 상태, 루트 여부를 확인한다.", emptyMap(), emptyList()),
        tool(
            "get_weather",
            "현재 날씨와 3일 예보를 조회한다(무료 Open-Meteo).",
            mapOf("location" to str("도시/지역 이름. 영어 권장(예: Seoul, Busan, Jeju)")),
            listOf("location"),
        ),
    )

    /** 도구 실행. 반환값은 Claude 에게 돌려줄 결과 문자열. */
    fun execute(name: String, input: Map<String, Any?>): String = try {
        when (name) {
            "create_calendar_event" -> createEvent(input)
            "list_calendar_events" -> listEvents(input)
            "delete_calendar_event" -> deleteEvent(input)
            "set_alarm" -> setAlarm(input)
            "set_timer" -> setTimer(input)
            "list_apps" -> listApps(input.s("query"))
            "open_app" -> openApp(input.s("package")!!)
            "install_apk_from_url" -> installFromUrl(input.s("url")!!, input.s("app_name"))
            "open_play_store" -> openPlayStore(input.s("package"), input.s("query"))
            "uninstall_app" -> uninstall(input.s("package")!!)
            "run_root_command" -> runRoot(input.s("command")!!, input.s("reason"))
            "get_device_status" -> deviceStatus()
            "get_weather" -> Weather.lookup(input.s("location")!!)
            else -> "오류: 알 수 없는 도구 $name"
        }
    } catch (e: SecurityException) {
        "오류: 권한이 없습니다(${e.message}). 민규 앱에서 권한을 허용해야 합니다."
    } catch (e: Exception) {
        Log.e("Iris", "tool $name failed", e)
        "오류: ${e.javaClass.simpleName}: ${e.message}"
    }

    // ---------- 캘린더 ----------

    private fun parseTime(s: String): Pair<LocalDateTime, Boolean> =
        if (s.length <= 10) LocalDate.parse(s).atStartOfDay() to true
        else LocalDateTime.parse(s.take(19)) to false

    private fun millis(t: LocalDateTime) = t.atZone(zone).toInstant().toEpochMilli()

    private fun calendarId(): Long {
        val proj = arrayOf(CalendarContract.Calendars._ID, CalendarContract.Calendars.IS_PRIMARY,
            CalendarContract.Calendars.CALENDAR_ACCESS_LEVEL, CalendarContract.Calendars.ACCOUNT_TYPE)
        var best: Long? = null
        var bestScore = -1
        ctx.contentResolver.query(CalendarContract.Calendars.CONTENT_URI, proj,
            "${CalendarContract.Calendars.VISIBLE}=1", null, null)?.use { c ->
            while (c.moveToNext()) {
                if (c.getInt(2) < CalendarContract.Calendars.CAL_ACCESS_CONTRIBUTOR) continue
                var score = 1
                if (c.getInt(1) == 1) score += 4
                if (c.getString(3) == "com.google") score += 2
                if (score > bestScore) { bestScore = score; best = c.getLong(0) }
            }
        }
        return best ?: error("쓸 수 있는 캘린더가 없습니다")
    }

    private fun createEvent(i: Map<String, Any?>): String {
        val (start, dateOnly) = parseTime(i.s("start")!!)
        val allDay = i.b("all_day") ?: dateOnly
        val end = i.s("end")?.let { parseTime(it).first }
            ?: if (allDay) start.plusDays(1) else start.plusHours(1)
        val values = ContentValues().apply {
            put(CalendarContract.Events.CALENDAR_ID, calendarId())
            put(CalendarContract.Events.TITLE, i.s("title"))
            i.s("description")?.let { put(CalendarContract.Events.DESCRIPTION, it) }
            i.s("location")?.let { put(CalendarContract.Events.EVENT_LOCATION, it) }
            if (allDay) {
                val utc = ZoneId.of("UTC")
                put(CalendarContract.Events.DTSTART, start.toLocalDate().atStartOfDay(utc).toInstant().toEpochMilli())
                put(CalendarContract.Events.DTEND, end.toLocalDate().atStartOfDay(utc).toInstant().toEpochMilli())
                put(CalendarContract.Events.EVENT_TIMEZONE, "UTC")
                put(CalendarContract.Events.ALL_DAY, 1)
            } else {
                put(CalendarContract.Events.DTSTART, millis(start))
                put(CalendarContract.Events.DTEND, millis(end))
                put(CalendarContract.Events.EVENT_TIMEZONE, TimeZone.getDefault().id)
            }
            put(CalendarContract.Events.HAS_ALARM, 1)
        }
        val uri = ctx.contentResolver.insert(CalendarContract.Events.CONTENT_URI, values)
            ?: error("일정 저장 실패")
        val id = uri.lastPathSegment!!.toLong()
        val minutes = i.i("reminder_minutes") ?: 10
        if (minutes >= 0) {
            ctx.contentResolver.insert(CalendarContract.Reminders.CONTENT_URI, ContentValues().apply {
                put(CalendarContract.Reminders.EVENT_ID, id)
                put(CalendarContract.Reminders.MINUTES, minutes)
                put(CalendarContract.Reminders.METHOD, CalendarContract.Reminders.METHOD_ALERT)
            })
        }
        return "일정 추가됨 (event_id=$id): ${i.s("title")} ${start.format(fmt)}~${end.format(fmt)}, ${minutes}분 전 알림"
    }

    private fun listEvents(i: Map<String, Any?>): String {
        val (start, _) = parseTime(i.s("start")!!)
        var (end, endDateOnly) = parseTime(i.s("end")!!)
        if (endDateOnly) end = end.plusDays(1)
        val b = CalendarContract.Instances.CONTENT_URI.buildUpon()
        android.content.ContentUris.appendId(b, millis(start))
        android.content.ContentUris.appendId(b, millis(end))
        val proj = arrayOf(CalendarContract.Instances.EVENT_ID, CalendarContract.Instances.TITLE,
            CalendarContract.Instances.BEGIN, CalendarContract.Instances.END,
            CalendarContract.Instances.ALL_DAY, CalendarContract.Instances.EVENT_LOCATION)
        val sb = StringBuilder()
        ctx.contentResolver.query(b.build(), proj, null, null, "${CalendarContract.Instances.BEGIN} ASC")?.use { c ->
            while (c.moveToNext()) {
                val begin = LocalDateTime.ofInstant(java.time.Instant.ofEpochMilli(c.getLong(2)),
                    if (c.getInt(4) == 1) ZoneId.of("UTC") else zone)
                sb.append("- event_id=").append(c.getLong(0)).append(" | ").append(c.getString(1))
                    .append(" | ").append(if (c.getInt(4) == 1) begin.toLocalDate().toString() + " 종일" else begin.format(fmt))
                c.getString(5)?.takeIf { it.isNotBlank() }?.let { sb.append(" | ").append(it) }
                sb.append('\n')
            }
        }
        return if (sb.isEmpty()) "해당 기간에 일정이 없습니다." else sb.toString()
    }

    private fun deleteEvent(i: Map<String, Any?>): String {
        val id = i.i("event_id")!!.toLong()
        val n = ctx.contentResolver.delete(
            android.content.ContentUris.withAppendedId(CalendarContract.Events.CONTENT_URI, id), null, null)
        return if (n > 0) "일정 삭제됨" else "해당 일정을 찾지 못했습니다"
    }

    // ---------- 알람/타이머 ----------

    private fun setAlarm(i: Map<String, Any?>): String {
        val h = i.i("hour")!!; val m = i.i("minute")!!
        val label = i.s("label") ?: "민규 알람"
        val days = (i["days"] as? List<*>)?.mapNotNull { (it as? Number)?.toInt() }.orEmpty()
        if (Root.available()) {
            val cmd = buildString {
                append("am start -a android.intent.action.SET_ALARM")
                append(" --ei android.intent.extra.alarm.HOUR $h --ei android.intent.extra.alarm.MINUTES $m")
                append(" --es android.intent.extra.alarm.MESSAGE ").append(Root.shellQuote(label))
                if (days.isNotEmpty()) append(" --eial android.intent.extra.alarm.DAYS ").append(days.joinToString(","))
                append(" --ez android.intent.extra.alarm.SKIP_UI true")
            }
            val r = Root.run(cmd, 20)
            if (r.ok && !r.err.contains("Error")) return "알람 설정: %02d:%02d %s".format(h, m, label)
        }
        ctx.startActivity(Intent(AlarmClock.ACTION_SET_ALARM).apply {
            putExtra(AlarmClock.EXTRA_HOUR, h); putExtra(AlarmClock.EXTRA_MINUTES, m)
            putExtra(AlarmClock.EXTRA_MESSAGE, label); putExtra(AlarmClock.EXTRA_SKIP_UI, true)
            if (days.isNotEmpty()) putExtra(AlarmClock.EXTRA_DAYS, ArrayList(days))
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        })
        return "알람 설정 요청함: %02d:%02d %s".format(h, m, label)
    }

    private fun setTimer(i: Map<String, Any?>): String {
        val sec = i.i("seconds")!!
        val label = i.s("label") ?: "민규 타이머"
        if (Root.available()) {
            val r = Root.run("am start -a android.intent.action.SET_TIMER --ei android.intent.extra.alarm.LENGTH $sec " +
                "--es android.intent.extra.alarm.MESSAGE ${Root.shellQuote(label)} --ez android.intent.extra.alarm.SKIP_UI true", 20)
            if (r.ok && !r.err.contains("Error")) return "타이머 ${sec}초 시작"
        }
        ctx.startActivity(Intent(AlarmClock.ACTION_SET_TIMER).apply {
            putExtra(AlarmClock.EXTRA_LENGTH, sec); putExtra(AlarmClock.EXTRA_MESSAGE, label)
            putExtra(AlarmClock.EXTRA_SKIP_UI, true); addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        })
        return "타이머 ${sec}초 요청함"
    }

    // ---------- 앱 ----------

    private fun listApps(query: String?): String {
        val pm = ctx.packageManager
        val q = query?.trim()?.lowercase().orEmpty()
        val apps = pm.getInstalledApplications(0)
            .filter { pm.getLaunchIntentForPackage(it.packageName) != null }
            .map { pm.getApplicationLabel(it).toString() to it.packageName }
            .filter { q.isEmpty() || it.first.lowercase().contains(q) || it.second.lowercase().contains(q) }
            .sortedBy { it.first }
        if (apps.isEmpty()) return "일치하는 앱이 없습니다"
        return apps.take(60).joinToString("\n") { "${it.first} = ${it.second}" }
    }

    private fun openApp(pkg: String): String {
        val launch = ctx.packageManager.getLaunchIntentForPackage(pkg) ?: return "오류: 설치되지 않았거나 실행할 수 없는 앱"
        if (Root.available()) {
            val comp = launch.component
            if (comp != null && Root.run("am start -n ${comp.packageName}/${comp.className}", 20).ok) return "$pkg 실행함"
        }
        ctx.startActivity(launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        return "$pkg 실행 요청함 (화면이 잠겨 있으면 잠금 해제 후 보입니다)"
    }

    private fun installFromUrl(url: String, appName: String?): String {
        if (!url.startsWith("https://")) return "오류: https 주소만 허용합니다"
        if (!Root.available()) return "오류: 루트 권한이 없어 자동 설치를 할 수 없습니다"
        if (!confirmer.confirm("${appName ?: "앱"}을 이 주소에서 내려받아 설치할까요?")) return "사용자가 설치를 취소함"
        val file = File(ctx.cacheDir, "download.apk")
        val conn = URL(url).openConnection() as HttpURLConnection
        conn.instanceFollowRedirects = true
        conn.connectTimeout = 20000; conn.readTimeout = 60000
        try {
            if (conn.responseCode !in 200..299) return "오류: 다운로드 실패 HTTP ${conn.responseCode}"
            conn.inputStream.use { inp -> file.outputStream().use { inp.copyTo(it) } }
        } finally { conn.disconnect() }
        val head = file.inputStream().use { val b = ByteArray(2); it.read(b); b }
        if (head[0] != 'P'.code.toByte() || head[1] != 'K'.code.toByte()) {
            file.delete(); return "오류: 받은 파일이 APK가 아닙니다(웹페이지 주소일 수 있음)"
        }
        val r = Root.installApk(file)
        file.delete()
        return if (r.ok) "설치 완료" else "설치 실패: ${r.summary(800)}"
    }

    private fun openPlayStore(pkg: String?, query: String?): String {
        val uri = when {
            !pkg.isNullOrBlank() -> "market://details?id=$pkg"
            !query.isNullOrBlank() -> "market://search?q=" + Uri.encode(query)
            else -> return "오류: package 또는 query 가 필요합니다"
        }
        if (Root.available() && Root.run("am start -a android.intent.action.VIEW -d ${Root.shellQuote(uri)} com.android.vending", 20).ok)
            return "플레이스토어를 열었습니다. 화면에서 설치를 눌러 주세요."
        ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(uri)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        return "플레이스토어 열기 요청함"
    }

    private fun uninstall(pkg: String): String {
        if (!Root.available()) return "오류: 루트 권한 없음"
        val label = try {
            ctx.packageManager.getApplicationLabel(ctx.packageManager.getApplicationInfo(pkg, 0)).toString()
        } catch (_: PackageManager.NameNotFoundException) { return "오류: 설치되지 않은 앱" }
        if (pkg == ctx.packageName) return "오류: 민규 자신은 삭제할 수 없습니다"
        if (!confirmer.confirm("$label 앱을 삭제할까요?")) return "사용자가 삭제를 취소함"
        val r = Root.run("pm uninstall ${Root.shellQuote(pkg)}", 60)
        return if (r.ok) "$label 삭제 완료" else "삭제 실패: ${r.summary(500)}"
    }

    private fun runRoot(command: String, reason: String?): String {
        if (!Root.available()) return "오류: 루트 권한 없음 (Magisk 에서 민규에 루트 허용 필요)"
        if (prefs.confirmDangerous && !isReadOnly(command)) {
            val q = (reason?.takeIf { it.isNotBlank() } ?: "명령을 실행") + "할까요?"
            if (!confirmer.confirm(q)) return "사용자가 실행을 취소함"
        }
        return Root.run(command, 120).summary()
    }

    /** 조회용 명령은 확인 없이 실행 */
    private fun isReadOnly(cmd: String): Boolean {
        val c = cmd.trim()
        if (Regex("[;&|>`$]").containsMatchIn(c)) return false
        val safe = listOf("settings get ", "dumpsys ", "getprop", "pm list ", "ls ", "cat /proc/", "df", "uptime", "date", "id", "whoami", "ps")
        return safe.any { c == it.trim() || c.startsWith(it) }
    }

    private fun deviceStatus(): String {
        val bm = ctx.getSystemService(BatteryManager::class.java)
        val level = bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
        val charging = bm.isCharging
        return "배터리 $level%, ${if (charging) "충전 중" else "충전 안 함"}, 루트 ${if (Root.available()) "있음" else "없음"}, " +
            "현재 ${LocalDateTime.now().format(fmt)} (${zone.id})"
    }

    // ---------- 도우미 ----------

    private fun Map<String, Any?>.s(k: String) = (this[k] as? String)?.takeIf { it.isNotBlank() }
    private fun Map<String, Any?>.i(k: String) = (this[k] as? Number)?.toInt() ?: (this[k] as? String)?.toIntOrNull()
    private fun Map<String, Any?>.b(k: String) = this[k] as? Boolean

    companion object {
        private fun str(d: String): Map<String, Any> = mapOf("type" to "string", "description" to d)
        private fun int(d: String): Map<String, Any> = mapOf("type" to "integer", "description" to d)
        private fun bool(d: String): Map<String, Any> = mapOf("type" to "boolean", "description" to d)

        private fun tool(name: String, desc: String, props: Map<String, Map<String, Any>>, required: List<String>) =
            ToolSpec(name, desc, props, required)
    }
}
