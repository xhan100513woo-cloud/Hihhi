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
import com.anthropic.models.messages.Tool
import com.anthropic.models.messages.ToolResultBlockParam
import com.anthropic.models.messages.WebSearchTool20260209

/** Claude API 로 대화하며 필요한 경우 휴대폰 도구를 실행하는 에이전트 루프. */
class ClaudeAgent(private val prefs: Prefs, private val tools: PhoneTools) : Assistant {

    private val claudeTools: List<Tool> = tools.specs.map { spec ->
        val p = Tool.InputSchema.Properties.builder()
        spec.props.forEach { (k, v) -> p.putAdditionalProperty(k, JsonValue.from(v)) }
        Tool.builder()
            .name(spec.name)
            .description(spec.description)
            .inputSchema(Tool.InputSchema.builder().properties(p.build()).required(spec.required).build())
            .build()
    }

    private var client: AnthropicClient? = null
    private var clientKey = ""
    private val history = mutableListOf<MessageParam>()
    private var lastTurnAt = 0L

    @Synchronized
    override fun reset() { history.clear() }

    @Synchronized
    override fun ask(userText: String): String {
        val key = prefs.claudeKey
        if (key.isBlank()) return "아직 API 키가 없어요. 민규 앱을 열어서 Claude API 키를 넣어 주세요."
        if (client == null || clientKey != key) {
            client = AnthropicOkHttpClient.builder().apiKey(key).build()
            clientKey = key
        }

        // 5분 넘게 대화가 없으면 새 대화로 시작
        val now = System.currentTimeMillis()
        if (now - lastTurnAt > 5 * 60_000 || history.size > 60) history.clear()
        lastTurnAt = now

        history += MessageParam.ofUser("[현재 시각: ${Persona.stamp()}]\n$userText")
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
        .model(prefs.claudeModel)
        .maxTokens(8000L)
        .system(Persona.systemPrompt(canSearchWeb = true))
        // 음성 비서라 빠른 응답이 중요하므로 effort 는 low
        .outputConfig(OutputConfig.builder().effort(OutputConfig.Effort.LOW).build())
        .addTool(WebSearchTool20260209.builder().maxUses(3L).build())
        .apply { claudeTools.forEach { addTool(it) } }
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
}
