import debug from 'debug'

const log = debug('content-review:ollama')

const DEFAULT_OLLAMA_BASE_URL = 'http://127.0.0.1:11434'
const DEFAULT_TIMEOUT_MS = 180000

/**
 * Call Ollama API directly with AbortController timeout.
 *
 * @param {Object} params
 * @param {string} params.prompt - The prompt to send
 * @param {string} params.model - Model ID (ollama/model:tag or bare model:tag format)
 * @param {number} [params.timeout_ms] - Timeout in milliseconds
 * @param {object} [params.format] - JSON schema for structured output (Ollama format parameter)
 * @returns {Promise<{output: string, duration_ms: number}>} Response and execution time
 */
export async function call_ollama({
  prompt,
  model,
  timeout_ms = DEFAULT_TIMEOUT_MS,
  format = null
}) {
  if (!prompt) {
    throw new Error('prompt is required')
  }
  if (!model) {
    throw new Error('model is required')
  }

  const model_name = model.startsWith('ollama/') ? model.slice(7) : model
  const base_url =
    process.env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_BASE_URL
  const url = `${base_url}/api/generate`

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
