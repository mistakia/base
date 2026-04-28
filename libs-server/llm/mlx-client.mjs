import debug from 'debug'

const log = debug('llm:mlx')

const DEFAULT_BASE_URL = 'http://127.0.0.1:8100'
const DEFAULT_TIMEOUT_MS = 180000
const DEFAULT_MAX_TOKENS = 2048

export function extract_mlx_model_name(model) {
  if (typeof model === 'string' && model.startsWith('mlx/')) {
    return model.slice(4)
  }
  return model
}

export async function call_mlx({
  prompt,
  system,
  model,
  base_url,
  timeout_ms = DEFAULT_TIMEOUT_MS,
  format = null,
  max_tokens = DEFAULT_MAX_TOKENS,
  temperature = 0
}) {
  if (!prompt) throw new Error('prompt is required')
  if (!model) throw new Error('model is required')

  const model_name = extract_mlx_model_name(model)
  const url = `${base_url || DEFAULT_BASE_URL}/v1/chat/completions`

  log('Calling MLX (vLLM): %s', model_name)
  const start_time = Date.now()

  const controller = new AbortController()
  const timeout_id = setTimeout(() => controller.abort(), timeout_ms)

  try {
    const messages = []
    if (system) messages.push({ role: 'system', content: system })
    messages.push({ role: 'user', content: prompt })
    const body = {
      model: model_name,
      messages,
      max_tokens,
      temperature,
      chat_template_kwargs: { enable_thinking: false }
    }
    if (format) {
      body.response_format = { type: 'json_object' }
      body.guided_json = format
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    })

    clearTimeout(timeout_id)
    const duration_ms = Date.now() - start_time

    if (!response.ok) {
      const error_text = await response.text()
      throw new Error(`MLX API error ${response.status}: ${error_text}`)
    }

    const data = await response.json()
    const content = data?.choices?.[0]?.message?.content || ''
    log('MLX completed in %dms', duration_ms)
    return { output: content, duration_ms }
  } catch (error) {
    clearTimeout(timeout_id)
    if (error.name === 'AbortError') {
      throw new Error(`MLX timed out after ${timeout_ms}ms`)
    }
    throw error
  }
}
