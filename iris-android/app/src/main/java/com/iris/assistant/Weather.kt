package com.iris.assistant

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/** 키가 필요 없는 Open-Meteo 로 날씨 조회 */
object Weather {
    fun lookup(location: String): String {
        val geo = getJson("https://geocoding-api.open-meteo.com/v1/search?count=1&language=ko&name=" +
            URLEncoder.encode(location, "UTF-8"))
        val place = geo.optJSONArray("results")?.optJSONObject(0) ?: return "오류: '$location' 위치를 찾지 못했습니다"
        val lat = place.getDouble("latitude"); val lon = place.getDouble("longitude")
        val w = getJson("https://api.open-meteo.com/v1/forecast?latitude=$lat&longitude=$lon&timezone=auto&forecast_days=3" +
            "&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,precipitation" +
            "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max")
        val c = w.getJSONObject("current")
        val d = w.getJSONObject("daily")
        val sb = StringBuilder()
        sb.append("${place.optString("name")}(${place.optString("admin1")}) 현재: ${describe(c.optInt("weather_code"))}, ")
            .append("기온 ${c.optDouble("temperature_2m")}도(체감 ${c.optDouble("apparent_temperature")}도), ")
            .append("습도 ${c.optInt("relative_humidity_2m")}%, 바람 ${c.optDouble("wind_speed_10m")}km/h, ")
            .append("강수 ${c.optDouble("precipitation")}mm\n")
        val days = d.getJSONArray("time")
        for (i in 0 until days.length()) {
            sb.append("${days.getString(i)}: ${describe(d.getJSONArray("weather_code").optInt(i))}, ")
                .append("최저 ${d.getJSONArray("temperature_2m_min").optDouble(i)}도 / 최고 ${d.getJSONArray("temperature_2m_max").optDouble(i)}도, ")
                .append("강수확률 ${d.getJSONArray("precipitation_probability_max").optInt(i)}%\n")
        }
        return sb.toString()
    }

    private fun describe(code: Int) = when (code) {
        0 -> "맑음"
        1, 2 -> "구름 조금"
        3 -> "흐림"
        45, 48 -> "안개"
        in 51..57 -> "이슬비"
        in 61..67 -> "비"
        in 71..77 -> "눈"
        in 80..82 -> "소나기"
        85, 86 -> "눈 소나기"
        in 95..99 -> "뇌우"
        else -> "알 수 없음"
    }

    private fun getJson(url: String): JSONObject {
        val conn = URL(url).openConnection() as HttpURLConnection
        conn.connectTimeout = 15000; conn.readTimeout = 15000
        try {
            return JSONObject(conn.inputStream.bufferedReader().readText())
        } finally { conn.disconnect() }
    }
}
