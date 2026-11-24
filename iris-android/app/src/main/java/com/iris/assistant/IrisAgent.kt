package com.iris.assistant

import android.util.Log
import com.anthropic.client.AnthropicClient
import com.anthropic.client.okhttp.AnthropicOkHttpClient
import com.anthropic.core.JsonValue
import com.anthropic.errors.AnthropicIoException
import com.anthropic.errors.AnthropicServiceException
import com.anthropic.errors.RateLimitException
import com.anthropic.errors.UnauthorizedException
import com.anthropic.models.messages.ContentBlockParam
import com.anthropic.models.messages.Message
import com.anthropic.models.messages.MessageCreateParams
import com.anthropic.models.messages.MessageParam
import com.anthropic.models.messages.OutputConfig
import com.anthropic.models.messages.StopReason
import com.anthropic.models.messages.ToolResultBlockParam
import com.anthropic.models.messages.WebSearchTool20260209
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/** Claude 와 대화하며 필요한 경우 휴대폰 도구를 실행하는 에이전트 루프. 백그라운드 스레드에서 호출할 것. */
class IrisAgent(private val prefs: Prefs, private val tools: PhoneTools) {

    private var client: AnthropicClient? = null
    private var clientKey = ""
    private val history = mutableListOf<MessageParam>()
    private var lastTurnAt = 0L

    @Synchronized
    fun reset() { history.clear() }

    @Synchronized
    fun ask(userText: String): String {
        val key = prefs.apiKey
        if (key.isBlank()) return "아직 API 키가 없어요. 아이리스 앱을 열어서 Claude API 키를 넣어 주세요."
        if (client == null || clientKey != key) {
            client = AnthropicOkHttpClient.builder().apiKey(key).build()
            clientKey = key
        }

        // 5분 넘게 대화가 없으면 새 대화로 시작
        val now = System.currentTimeMillis()
        if (now - lastTurnAt > 5 * 60_000 || history.size > 60) history.clear()
        lastTurnAt = now

        val stamp = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd(E) HH:mm", Locale.KOREAN))
        history += MessageParam.ofUser("[현재 시각: $stamp, ${ZoneId.systemDefault().id}]\n$userText")
        val rollbackTo = history.size - 1

        try {
            repeat(12) {
                val response = client!!.messages().create(buildParams())
                history += assistantParam(response)
                when (response.stopReason().orElse(null)) {
                    StopReason.TOOL_USE -> history += MessageParam.ofUserOfContentBlockParams(runTools(response))
                    StopReason.PAUSE_TURN -> Unit // 웹 검색이 길어지면 이어서 요청
                    StopReason.REFUSAL -> return "죄송해요, 그 요청은 도와드리기 어려워요."
                    else -> return textOf(response).ifBlank { "완료했어요." }
                }
            }
            return "작업이 너무 길어져서 중간에 멈췄어요."
        } catch (e: UnauthorizedException) {
            dropFrom(rollbackTo); return "API 키가 올바르지 않아요. 앱에서 키를 확인해 주세요."
        } catch (e: RateLimitException) {
            dropFrom(rollbackTo); return "요청이 너무 많아요. 잠시 뒤에 다시 말해 주세요."
        } catch (e: AnthropicServiceException) {
            Log.e("Iris", "api error", e)
            dropFrom(rollbackTo); return "Claude 서버 오류가 났어요. 코드 ${e.statusCode()}."
        } catch (e: AnthropicIoException) {
            dropFrom(rollbackTo); return "인터넷 연결을 확인해 주세요."
        } catch (e: Exception) {
            Log.e("Iris", "agent error", e)
            dropFrom(rollbackTo); return "처리하다 오류가 났어요."
        }
    }

    private fun dropFrom(index: Int) {
        while (history.size > index) history.removeAt(history.size - 1)
    }

    private fun buildParams(): MessageCreateParams = MessageCreateParams.builder()
        .model(prefs.model)
        .maxTokens(8000L)
        .system(SYSTEM_PROMPT)
        // 음성 비서라 빠른 응답이 중요하므로 effort 는 low
        .outputConfig(OutputConfig.builder().effort(OutputConfig.Effort.LOW).build())
        .addTool(WebSearchTool20260209.builder().maxUses(3L).build())
        .apply { tools.tools.forEach { addTool(it) } }
        .messages(history.toList())
        // 안전 분류기가 거절하면 서버가 다른 모델로 자동 재시도
        .putAdditionalHeader("anthropic-beta", "server-side-fallback-2026-07-01")
        .putAdditionalBodyProperty("fallbacks", JsonValue.from("default"))
        .build()

    private fun assistantParam(m: Message): MessageParam = try {
        m.toParam()
    } catch (_: Exception) {
        MessageParam.ofAssistantOfContentBlockParams(m.content().mapNotNull { runCatching { it.toParam() }.getOrNull() })
    }

    private fun runTools(m: Message): List<ContentBlockParam> =
        m.content().mapNotNull { it.toolUse().orElse(null) }.map { use ->
            @Suppress("UNCHECKED_CAST")
            val input = try { use._input().convert(Map::class.java) as Map<String, Any?> } catch (_: Exception) { emptyMap() }
            Log.i("Iris", "tool ${use.name()} $input")
            val result = tools.execute(use.name(), input)
            Log.i("Iris", "tool result: $result")
            ContentBlockParam.ofToolResult(
                ToolResultBlockParam.builder()
                    .toolUseId(use.id())
                    .content(result)
                    .isError(result.startsWith("오류"))
                    .build()
            )
        }

    private fun textOf(m: Message) = m.content().mapNotNull { it.text().orElse(null)?.text() }.joinToString(" ").trim()

    companion object {
        val SYSTEM_PROMPT = """
            너는 '아이리스'라는 한국어 음성 비서다. 사용자의 안드로이드 휴대폰(갤럭시 노트20, 루팅됨)에서 실행되고,
            사용자는 화면을 보지 않고 음성으로만 대화한다. 네 답변은 그대로 음성(TTS)으로 읽힌다.

            답변 방식:
            - 짧고 자연스러운 존댓말 구어체로 1~3문장. 목록이 필요하면 "첫째, 둘째"처럼 말로 풀어라.
            - 마크다운, 표, 이모지, URL, 괄호 속 부연 설명을 쓰지 마라.
            - 숫자와 시간은 읽기 쉽게 말하라(예: 오후 3시 30분).
            - 사실 확인이 필요하거나 최신 정보(날씨, 뉴스, 가격, 일정 정보 등)는 web_search 로 찾아본 뒤 답하라.

            작업 방식:
            - 일정 예약은 create_calendar_event, 일정 확인은 list_calendar_events, 알람은 set_alarm, 타이머는 set_timer 를 쓴다.
              "내일", "다음 주 월요일" 같은 표현은 메시지 앞의 현재 시각을 기준으로 계산한다. 시간이 빠져 있으면 한 번만 짧게 물어본다.
            - 앱 설치: 설치하려는 앱이 플레이스토어 앱이면 open_play_store 로 페이지를 연다(사용자가 화면에서 설치를 눌러야 한다고 알려줘라).
              공식 사이트나 F-Droid 등 신뢰할 수 있는 곳의 APK 직접 주소를 알면 install_apk_from_url 로 바로 설치할 수 있다.
              주소를 모르면 web_search 로 공식 다운로드 주소를 찾아라. 출처가 불분명한 APK 는 설치하지 마라.
            - 앱 실행은 list_apps 로 패키지명을 찾은 뒤 open_app.
            - 그 밖의 기기 조작(와이파이, 블루투스, 밝기, 음량, 손전등 등)은 run_root_command 로 settings/svc/cmd/input 명령을 쓴다.
              되돌리기 어렵거나 데이터를 지우는 명령은 실행하지 말고 말로 설명만 하라.
            - 사용자가 '취소함'이라고 나오면 억지로 다시 시도하지 마라.
            - 일을 마치면 무엇을 했는지 한 문장으로 알려줘라. 사용자에게 되물을 때는 반드시 물음표로 끝내라.
        """.trimIndent()
    }
}
