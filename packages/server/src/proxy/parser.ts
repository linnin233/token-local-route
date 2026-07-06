/**
 * OpenAI 兼容 API 响应解析器
 *
 * 从 DeepSeek API 的响应中提取 token 用量、模型等统计信息。
 * 支持流式 (SSE streaming) 和非流式 (JSON) 两种模式。
 */

// ============================================================================
// 类型定义
// ============================================================================

/** 解析后的 token 用量与模型信息 */
export interface ParsedResponse {
  input_tokens: number;       // prompt token 数
  output_tokens: number;      // completion token 数
  cache_read_tokens: number;  // 缓存读取 token（DeepSeek 暂无此字段，保留为 0）
  cache_write_tokens: number; // 缓存写入 token（DeepSeek 暂无此字段，保留为 0）
  model: string;              // 实际使用的模型
}

/** 默认的空 ParsedResponse，在解析失败时作为兜底 */
const EMPTY_PARSED: ParsedResponse = {
  input_tokens: 0,
  output_tokens: 0,
  cache_read_tokens: 0,
  cache_write_tokens: 0,
  model: 'unknown',
};

// ============================================================================
// 非流式响应解析
// ============================================================================

/**
 * 解析非流式 Chat Completions 响应的 JSON body，
 * 提取 usage 和 model 信息。
 *
 * DeepSeek 返回格式 (OpenAI 兼容):
 * ```json
 * {
 *   "model": "deepseek-chat",
 *   "usage": {
 *     "prompt_tokens": 10,
 *     "completion_tokens": 20,
 *     "total_tokens": 30
 *   }
 * }
 * ```
 *
 * @param body - 完整的响应 JSON 字符串
 * @returns 解析后的 ParsedResponse；若解析失败则返回全零的默认对象
 */
export function parseNonStreamResponse(body: string): ParsedResponse {
  try {
    const json = JSON.parse(body);

    // 错误响应（如 API key 无效、rate limit 等）——不回抛，直接返回默认值
    if (json.error) {
      console.warn('[parser] API error response:', json.error.message || JSON.stringify(json.error));
      return EMPTY_PARSED;
    }

    const usage = json.usage || {};
    return {
      input_tokens: usage.prompt_tokens ?? 0,
      output_tokens: usage.completion_tokens ?? 0,
      // DeepSeek 暂无 cache 字段，固定为 0
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      model: json.model || 'unknown',
    };
  } catch {
    console.warn('[parser] Failed to parse non-stream response JSON');
    return EMPTY_PARSED;
  }
}

// ============================================================================
// 流式响应 (SSE) 解析
// ============================================================================

/**
 * 解析单个 SSE chunk。
 *
 * 输入是去掉 "data: " 前缀后的单行内容。
 *
 * @param chunk - 去掉 "data: " 前缀后的 SSE 数据行
 * @returns 包含 content 文本增量、finish_reason、以及 usage 的对象
 */
export function parseStreamChunk(chunk: string): {
  content: string;
  finishReason: string | null;
  usage: ParsedResponse | null;
} {
  // [DONE] 标记 —— 流结束
  if (chunk === '[DONE]' || chunk.trim() === '[DONE]') {
    return { content: '', finishReason: 'stop', usage: null };
  }

  try {
    const json = JSON.parse(chunk);
    const choice = json.choices?.[0];

    const content: string = choice?.delta?.content || '';
    const finishReason: string | null = choice?.finish_reason || null;

    // DeepSeek 在最后一个 chunk 的 usage 字段中返回完整用量
    let usage: ParsedResponse | null = null;
    if (json.usage) {
      usage = {
        input_tokens: json.usage.prompt_tokens ?? 0,
        output_tokens: json.usage.completion_tokens ?? 0,
        cache_read_tokens: 0,
        cache_write_tokens: 0,
        model: json.model || 'unknown',
      };
    }

    return { content, finishReason, usage };
  } catch {
    // 某些 chunk 可能是空行等非 JSON 数据，静默忽略
    return { content: '', finishReason: null, usage: null };
  }
}

// ============================================================================
// 完整 SSE 流解析
// ============================================================================

/**
 * 从完整的 SSE 流式响应文本中提取 token 用量。
 *
 * 策略：
 *  1. 逐行解析所有 "data: " 前缀的行，找到最后一个包含 usage 的 chunk
 *  2. 如果找不到 usage（某些 provider 可能不返回），
 *     根据累计内容长度估算（保守 ~4 字符 / token）
 *
 * @param body - 完整的 SSE 响应正文（所有 chunk 拼接在一起）
 * @returns 解析后的 ParsedResponse，若完全无法解析则返回 null
 */
export function extractTokensFromSSEStream(body: string): ParsedResponse | null {
  const lines = body.split('\n');
  let lastUsage: ParsedResponse | null = null;
  let totalContent = '';
  let model = 'unknown';

  for (const line of lines) {
    if (!line.startsWith('data: ')) continue;

    const data = line.slice(6); // 去掉 "data: " 前缀
    const result = parseStreamChunk(data);

    totalContent += result.content;
    if (result.usage) {
      lastUsage = result.usage;
      model = result.usage.model || model;
    }
  }

  // 找到了 usage，优先返回
  if (lastUsage) {
    return lastUsage;
  }

  // Fallback：根据内容长度估算 output_tokens
  if (totalContent.length > 0) {
    const estimatedTokens = Math.max(1, Math.ceil(totalContent.length / 4));
    return {
      input_tokens: 0,
      output_tokens: estimatedTokens,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      model,
    };
  }

  return null;
}

// ============================================================================
// Anthropic Messages API 解析
// ============================================================================

/**
 * 解析 Anthropic 格式的非流式响应
 *
 * DeepSeek Anthropic 兼容端点返回格式:
 * {
 *   "id": "...", "type": "message", "model": "deepseek-v4-flash",
 *   "content": [{ "type": "text", "text": "..." }],
 *   "usage": { "input_tokens": 10, "output_tokens": 20,
 *              "cache_read_input_tokens": 0, "cache_creation_input_tokens": 0 }
 * }
 */
export function parseAnthropicResponse(body: string): ParsedResponse {
  try {
    const json = JSON.parse(body);

    if (json.error) {
      console.warn('[parser] Anthropic API error:', json.error.message || json.error);
      return { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0, model: 'unknown' };
    }

    const usage = json.usage || {};
    return {
      input_tokens: usage.input_tokens ?? 0,
      output_tokens: usage.output_tokens ?? 0,
      cache_read_tokens: usage.cache_read_input_tokens ?? 0,
      cache_write_tokens: usage.cache_creation_input_tokens ?? 0,
      model: json.model || 'unknown',
    };
  } catch {
    return { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0, model: 'unknown' };
  }
}

/**
 * 从 Anthropic SSE 流式响应中提取 token 用量
 *
 * Anthropic 流式格式:
 *   event: message_start
 *   data: {"type":"message_start","message":{"model":"...","usage":{"input_tokens":X}}}
 *
 *   event: content_block_delta
 *   data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"..."}}
 *
 *   event: message_delta
 *   data: {"type":"message_delta","usage":{"output_tokens":Y}}
 *
 *   event: message_stop
 *   data: {"type":"message_stop"}
 *
 * 用量分布在 message_start (input_tokens) 和 message_delta (output_tokens)
 */
export function extractAnthropicTokensFromStream(body: string): ParsedResponse | null {
  const events = body.split(/\n(?=event:)/); // 按 event: 分割
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheRead = 0;
  let cacheWrite = 0;
  let model = 'unknown';

  for (const event of events) {
    const lines = event.split('\n');
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        const json = JSON.parse(line.slice(6));

        // message_start 包含 input_tokens
        if (json.type === 'message_start' && json.message) {
          const u = json.message.usage || {};
          inputTokens = u.input_tokens ?? 0;
          cacheRead = u.cache_read_input_tokens ?? 0;
          cacheWrite = u.cache_creation_input_tokens ?? 0;
          model = json.message.model || model;
        }

        // message_delta 包含 output_tokens
        if (json.type === 'message_delta') {
          const u = json.usage || {};
          outputTokens = u.output_tokens ?? 0;
          // message_delta 也可能带完整的 usage
          if (u.input_tokens) inputTokens = u.input_tokens;
        }
      } catch { /* skip non-JSON lines */ }
    }
  }

  if (inputTokens === 0 && outputTokens === 0) return null;

  return { input_tokens: inputTokens, output_tokens: outputTokens,
    cache_read_tokens: cacheRead, cache_write_tokens: cacheWrite, model };
}
