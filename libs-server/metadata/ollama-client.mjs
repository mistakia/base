import debug from 'debug'
import config from '#config'

const log = debug('metadata:ollama')

const DEFAULT_TIMEOUT_MS = config.opencode?.timeout_ms || 120000
const OLLAMA_NUM_CTX = config.ollama?.num_ctx || 16384
const OLLAMA_KEEP_ALIVE =
  process.env.OLLAMA_KEEP_ALIVE || config.ollama?.keep_alive || '1m'
const OLLAMA_BASE_URL =
  process.env.OLLAMA_BASE_URL ||
  config.ollama?.base_url ||
  'http://127.0.0.1:11434'

export const extract_ollama_model_name = (model) => {
  if (model.startsWith('ollama/')) {
    return model.slice(7)
  }
  return model
}

/**
 * Call the Ollama HTTP API directly.
 *
 * @param {Object} params
 * @param {string} params.prompt
 * @param {string} params.model - Model ID (ollama/model:tag or bare model name)
 * @param {number} [params.timeout_ms]
 * @param {object} [params.format] - JSON schema for structured output
 * @returns {Promise<{output: string, duration_ms: number}>}
 */
export const call_ollama = async ({
  prompt,
  model,
  timeout_ms = DEFAULT_TIMEOUT_MS,
  format = null
}) => {
  const model_name = extract_ollama_model_name(model)
  const url = `${OLLAMA_BASE_URL}/api/generate`

  log(`Calling Ollama: ${model_name}`)
  const start_time = Date.now()

  const controller = new AbortController()
  const timeout_id = setTimeout(() => controller.abort(), timeout_ms)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model_name,
        prompt,
        stream: false,
        think: false,
        options: { num_ctx: OLLAMA_NUM_CTX },
        keep_alive: OLLAMA_KEEP_ALIVE,
        ...(format && { format })
      }),
      signal: controller.signal
    })

    clearTimeout(timeout_id)
    const duration_ms = Date.now() - start_time

    if (!response.ok) {
      const error_text = await response.text()
      throw new Error(`Ollama API error ${response.status}: ${error_text}`)
    }

    const data = await response.json()
    log(`Ollama completed in ${duration_ms}ms`)

    return {
      output: data.response || '',
      duration_ms
    }
  } catch (error) {
    clearTimeout(timeout_id)
    if (error.name === 'AbortError') {
      throw new Error(`Ollama timed out after ${timeout_ms}ms`)
    }
    throw error
  }
}
