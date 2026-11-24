package com.iris.assistant

import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/**
 * 구글 Gemini API(무료 등급 가능)로 대화하며 휴대폰 도구를 실행한다.
 * REST generateContent 를 직접 호출한다. 무료 등급에는 구글 검색 기능이 없어서 웹 검색은 쓰지 않는다.
 */
class GeminiAgent(private val prefs: Prefs, private val tools: PhoneTools) : Assistant {

    private val history = JSONArray()
    private var lastTurnAt = 0L

    private val toolsJson: JSONArray by lazy {
        val decls = JSONArray()
        tools.specs.forEach { spec ->
            val params = JSONObject().put("type", "object")
                .put("properties", JSONObject(spec.props as Map<*, *>))
            if (spec.required.isNotEmpty()) params.put("required", JSONArray(spec.required))
            decls.put(JSONObject()
                .put("name", spec.name)
                .put("description", spec.description)
                .apply { if (spec.props.isNotEmpty()) put("parameters", params) })
        }
        JSONArray().put(JSONObject().put("functionDeclarations", decls))
    }

    @Synchronized
    override fun reset() { clear() }

    private fun clear() { while (history.length() > 0) history.remove(history.length() - 1) }

    private fun truncate(to: Int) { while (history.length() > to) history.remove(history.length() - 1) }

    @Synchronized
    override fun ask(userText: String): String {
        val key = prefs.geminiKey
        if (key.isBlank()) return "아직 API 키가 없어요. 아이리스 앱을 열어서 Gemini API 키를 넣어 주세요."

        val now = System.currentTimeMillis()
        if (now - lastTurnAt > 5 * 60_000 || history.length() > 60) clear()
        lastTurnAt = now

        val rollbackTo = history.length()
        history.put(userContent(JSONObject().put("text", "[현재 시각: ${Persona.stamp()}]\n$userText")))

        try {
            repeat(10) {
                val res = post(key, buildRequest())
                res.optJSONObject("promptFeedback")?.optString("blockReason")?.takeIf { it.isNotEmpty() }?.let {
                    truncate(rollbackTo); return "죄송해요, 그 요청은 도와드리기 어려워요."
                }
                val cand = res.optJSONArray("candidates")?.optJSONObject(0)
                    ?: run { truncate(rollbackTo); return "대답을 받지 못했어요." }
                val content = cand.optJSONObject("content") ?: JSONObject().put("role", "model").put("parts", JSONArray())
                if (!content.has("role")) content.put("role", "model")
                val parts = content.optJSONArray("parts") ?: JSONArray()
                if (parts.length() == 0) {
                    truncate(rollbackTo)
                    return when (cand.optString("finishReason")) {
                        "SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII" -> "죄송해요, 그 요청은 도와드리기 어려워요."
                        else -> "대답을 받지 못했어요."
                    }
                }
                // thoughtSignature 등이 들어 있으므로 받은 그대로 기록에 넣는다
                history.put(content)

                val responses = JSONArray()
                val texts = StringBuilder()
                for (i in 0 until parts.length()) {
                    val part = parts.getJSONObject(i)
                    val call = part.optJSONObject("functionCall")
                    if (call != null) {
                        val name = call.optString("name")
                        val args = jsonToMap(call.optJSONObject("args") ?: JSONObject())
                        Log.i("Iris", "tool $name $args")
                        val result = tools.execute(name, args)
                        Log.i("Iris", "tool result: $result")
                        val fr = JSONObject().put("name", name)
                            .put("response", JSONObject().put(if (result.startsWith("오류")) "error" else "result", result))
                        call.optString("id").takeIf { it.isNotEmpty() }?.let { fr.put("id", it) }
                        responses.put(JSONObject().put("functionResponse", fr))
                    } else if (!part.optBoolean("thought")) {
                        part.optString("text").takeIf { it.isNotBlank() }?.let { texts.append(it).append(' ') }
                    }
                }
                if (responses.length() == 0) return texts.toString().trim().ifBlank { "완료했어요." }
                history.put(JSONObject().put("role", "user").put("parts", responses))
            }
            return "작업이 너무 길어져서 중간에 멈췄어요."
        } catch (e: GeminiError) {
            truncate(rollbackTo)
            Log.e("Iris", "gemini ${e.code}: ${e.body}")
            return when {
                e.body.contains("API_KEY_INVALID") || e.code == 401 || e.code == 403 ->
                    "Gemini API 키가 올바르지 않거나 권한이 없어요. 앱에서 키를 확인해 주세요."
                e.code == 429 -> "오늘 무료 사용량을 다 썼거나 요청이 너무 많아요. 조금 뒤에 다시 말해 주세요."
                e.code == 404 -> "모델 이름 ${prefs.geminiModel} 을 찾을 수 없어요. 앱에서 모델 이름을 확인해 주세요."
                e.code == 400 && e.body.contains("location", true) -> "이 지역에서는 Gemini 무료 사용이 안 된대요."
                else -> "Gemini 서버 오류가 났어요. 코드 ${e.code}."
            }
        } catch (e: IOException) {
            truncate(rollbackTo); return "인터넷 연결을 확인해 주세요."
        } catch (e: Exception) {
            Log.e("Iris", "gemini agent error", e)
            truncate(rollbackTo); return "처리하다 오류가 났어요."
        }
    }

    private fun userContent(part: JSONObject) = JSONObject().put("role", "user").put("parts", JSONArray().put(part))

    private fun buildRequest(): JSONObject {
        val req = JSONObject()
            .put("systemInstruction", JSONObject().put("parts",
                JSONArray().put(JSONObject().put("text", Persona.systemPrompt(canSearchWeb = false)))))
            .put("contents", history)
            .put("tools", toolsJson)
        // Gemini 3 계열은 생각 수준을 낮춰 빠르게 대답
        if (prefs.geminiModel.startsWith("gemini-3")) {
            req.put("generationConfig", JSONObject().put("thinkingConfig", JSONObject().put("thinkingLevel", "low")))
        }
        return req
    }

    private class GeminiError(val code: Int, val body: String) : Exception("HTTP $code")

    private fun post(key: String, body: JSONObject): JSONObject {
        val url = URL("https://generativelanguage.googleapis.com/v1beta/models/${prefs.geminiModel}:generateContent")
        val conn = url.openConnection() as HttpURLConnection
        conn.requestMethod = "POST"
        conn.connectTimeout = 20000
        conn.readTimeout = 90000
        conn.doOutput = true
        conn.setRequestProperty("Content-Type", "application/json; charset=utf-8")
        conn.setRequestProperty("x-goog-api-key", key)
        try {
            conn.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            val code = conn.responseCode
            val text = (if (code in 200..299) conn.inputStream else conn.errorStream)
                ?.bufferedReader()?.readText().orEmpty()
            if (code !in 200..299) throw GeminiError(code, text)
            return JSONObject(text)
        } finally {
            conn.disconnect()
        }
    }

    private fun jsonToMap(o: JSONObject): Map<String, Any?> {
        val m = LinkedHashMap<String, Any?>()
        o.keys().forEach { k -> m[k] = unwrap(o.get(k)) }
        return m
    }

    private fun unwrap(v: Any?): Any? = when (v) {
        is JSONObject -> jsonToMap(v)
        is JSONArray -> (0 until v.length()).map { unwrap(v.get(it)) }
        JSONObject.NULL -> null
        else -> v
    }
}
