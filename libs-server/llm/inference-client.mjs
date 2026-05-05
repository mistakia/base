import debug from 'debug'

import config from '#config'

const log = debug('llm:inference')

const DEFAULT_TIMEOUT_MS = 180000

/**
 * Provider-agnostic inference call.
 *
 * Branches on `provider`:
 *   - `ollama`   -> POST {endpoint}/api/generate (native format JSON schema, num_ctx, keep_alive)
 *   - `vllm-mlx` -> POST {endpoint}/v1/chat/completions (OpenAI-compat with guided_json)
 *
 * For the Ollama branch, environment variables override config:
 *   process.env.OLLAMA_BASE_URL   -> overrides endpoint
 *   process.env.OLLAMA_KEEP_ALIVE -> overrides config.model_roles.inference_providers.ollama.keep_alive
 *
 * @param {Object} params
 * @param {('ollama'|'vllm-mlx')} params.provider
 * @param {string} params.endpoint
 * @param {string} params.model
 * @param {string} params.prompt
 * @param {string} [params.system]
 * @param {object} [params.format] JSON schema (Ollama native `format`, vLLM `guided_json`)
 * @param {number} [params.max_tokens]
 * @param {number} [params.temperature]
 * @param {number} [params.timeout_ms]
 * @returns {Promise<{output: string, duration_ms: number}>}
 */
export async function call_inference({
  provider,
  endpoint,
  model,
  prompt,
  system,
  format,
  max_tokens,
  temperature,
  timeout_ms = DEFAULT_TIMEOUT_MS
}) {
  if (!provider) throw new Error('provider is required')
  if (!model) throw new Error('model is required')
  if (!prompt) throw new Error('prompt is required')

  if (provider === 'ollama') {
    return call_ollama_inference({
      endpoint,
      model,
      prompt,
      format,
      max_tokens,
      temperature,
      timeout_ms
    })
  }

  if (provider === 'vllm-mlx') {
    return call_vllm_mlx_inference({
      endpoint,
      model,
      prompt,
      system,
      format,
      max_tokens,
      temperature,
      timeout_ms
    })
  }

  throw new Error(`Unknown inference provider: ${provider}`)
}

async function call_ollama_inference({
  endpoint,
  model,
  prompt,
  format,
  max_tokens,
  temperature,
  timeout_ms
}) {
  const ollama_provider_config =
    config.model_roles?.inference_providers?.ollama ?? {}
  const effective_endpoint = process.env.OLLAMA_BASE_URL ?? endpoint
  const keep_alive =
    process.env.OLLAMA_KEEP_ALIVE ?? ollama_provider_config.keep_alive ?? '1m'
  const num_ctx = ollama_provider_config.num_ctx ?? 16384

  if (!effective_endpoint) throw new Error('endpoint is required for ollama')

  const url = `${effective_endpoint}/api/generate`

  log('Calling Ollama: %s', model)
  const start_time = Date.now()

  const controller = new AbortController()
  const timeout_id = setTimeout(() => controller.abort(), timeout_ms)

  try {
    const options = { num_ctx }
    if (temperature !== undefined) options.temperature = temperature
    if (max_tokens !== undefined) options.num_predict = max_tokens

    const body = {
      model,
      prompt,
      stream: false,
      options,
      keep_alive
    }
    if (format) body.format = format

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
      throw new Error(`Ollama API error ${response.status}: ${error_text}`)
    }

    const data = await response.json()
    log('Ollama completed in %dms', duration_ms)
    return { output: data.response || '', duration_ms }
  } catch (error) {
    clearTimeout(timeout_id)
    if (error.name === 'AbortError') {
      throw new Error(`Ollama timed out after ${timeout_ms}ms`)
    }
    throw error
  }
}

async function call_vllm_mlx_inference({
  endpoint,
  model,
  prompt,
  system,
  format,
  max_tokens,
  temperature,
  timeout_ms
}) {
  if (!endpoint) throw new Error('endpoint is required for vllm-mlx')

  const url = `${endpoint}/v1/chat/completions`

  log('Calling vLLM-MLX: %s', model)
  const start_time = Date.now()

  const controller = new AbortController()
  const timeout_id = setTimeout(() => controller.abort(), timeout_ms)

  try {
    const messages = []
    if (system) messages.push({ role: 'system', content: system })
    messages.push({ role: 'user', content: prompt })
    const body = {
      model,
      messages,
      chat_template_kwargs: { enable_thinking: false }
    }
    if (max_tokens !== undefined) body.max_tokens = max_tokens
    if (temperature !== undefined) body.temperature = temperature
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
      throw new Error(`vLLM-MLX API error ${response.status}: ${error_text}`)
    }

    const data = await response.json()
    const content = data?.choices?.[0]?.message?.content || ''
    log('vLLM-MLX completed in %dms', duration_ms)
    return { output: content, duration_ms }
  } catch (error) {
    clearTimeout(timeout_id)
    if (error.name === 'AbortError') {
      throw new Error(`vLLM-MLX timed out after ${timeout_ms}ms`)
    }
    throw error
  }
}
