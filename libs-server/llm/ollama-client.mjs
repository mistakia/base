import debug from 'debug'

import config from '#config'

const log = debug('llm:ollama')

const DEFAULT_BASE_URL = 'http://127.0.0.1:11434'
const DEFAULT_TIMEOUT_MS = 180000
const DEFAULT_EMBEDDING_MODEL = 'nomic-embed-text'
const DEFAULT_EMBEDDING_TIMEOUT_MS = 60000

function resolve_base_url(base_url) {
  return (
    base_url ||
    process.env.OLLAMA_BASE_URL ||
    config.ollama?.base_url ||
    DEFAULT_BASE_URL
  )
}

function resolve_keep_alive() {
  return process.env.OLLAMA_KEEP_ALIVE || config.ollama?.keep_alive || '1m'
}

function resolve_num_ctx() {
  return config.ollama?.num_ctx || 16384
}

export function extract_ollama_model_name(model) {
  if (typeof model === 'string' && model.startsWith('ollama/')) {
    return model.slice(7)
  }
  return model
}

export async function call_ollama({
  prompt,
  model,
  base_url,
  timeout_ms = DEFAULT_TIMEOUT_MS,
  format = null,
  think = undefined
}) {
  if (!prompt) throw new Error('prompt is required')
  if (!model) throw new Error('model is required')

  const model_name = extract_ollama_model_name(model)
  const url = `${resolve_base_url(base_url)}/api/generate`

  log('Calling Ollama: %s', model_name)
  const start_time = Date.now()

  const controller = new AbortController()
  const timeout_id = setTimeout(() => controller.abort(), timeout_ms)

  try {
    const body = {
      model: model_name,
      prompt,
      stream: false,
      options: { num_ctx: resolve_num_ctx() },
      keep_alive: resolve_keep_alive()
    }
    if (think !== undefined) body.think = think
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

export async function embed_texts({
  texts,
  model = DEFAULT_EMBEDDING_MODEL,
  base_url,
  timeout_ms = DEFAULT_EMBEDDING_TIMEOUT_MS,
  signal
}) {
  if (!texts || texts.length === 0) {
    throw new Error('texts array is required and must not be empty')
  }

  const url = `${resolve_base_url(base_url)}/api/embed`

  log('Embedding %d texts with %s', texts.length, model)
  const start_time = Date.now()

  const controller = new AbortController()
  const timeout_id = setTimeout(() => controller.abort(), timeout_ms)

  // Relay external abort (orchestrator timeout) into the fetch controller.
  let external_abort_handler = null
  if (signal) {
    if (signal.aborted) {
      controller.abort()
    } else {
      external_abort_handler = () => controller.abort()
      signal.addEventListener('abort', external_abort_handler, { once: true })
    }
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input: texts }),
      signal: controller.signal
    })

    clearTimeout(timeout_id)
    if (external_abort_handler && signal) {
      signal.removeEventListener('abort', external_abort_handler)
    }
    const duration_ms = Date.now() - start_time

    if (!response.ok) {
      const error_text = await response.text()
      throw new Error(`Ollama embed API error ${response.status}: ${error_text}`)
    }

    const data = await response.json()
    if (!data.embeddings || !Array.isArray(data.embeddings)) {
      throw new Error(
        'Ollama embed API returned unexpected response: missing embeddings array'
      )
    }

    log('Embedding completed in %dms (%d vectors)', duration_ms, data.embeddings.length)
    return { embeddings: data.embeddings, duration_ms }
  } catch (error) {
    clearTimeout(timeout_id)
    if (external_abort_handler && signal) {
      signal.removeEventListener('abort', external_abort_handler)
    }
    if (error.name === 'AbortError') {
      if (signal?.aborted) {
        const abort_error = new Error('Ollama embedding aborted')
        abort_error.name = 'AbortError'
        throw abort_error
      }
      throw new Error(`Ollama embedding timed out after ${timeout_ms}ms`)
    }
    throw error
  }
}
