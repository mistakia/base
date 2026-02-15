import { spawn } from 'child_process'
import debug from 'debug'
import config from '#config'

const log = debug('metadata:opencode')

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_MODEL = config.opencode?.default_model || 'ollama/qwen2.5:72b'
const TIMEOUT_MS = config.opencode?.timeout_ms || 120000
const OLLAMA_BASE_URL =
  process.env.OLLAMA_BASE_URL ||
  config.ollama?.base_url ||
  'http://127.0.0.1:11434'
const BINARY_PATH =
  process.env.OPENCODE_BINARY_PATH ||
  config.opencode?.binary_path ||
  '/opt/homebrew/bin/opencode'

// Use direct ollama API by default (faster, more reliable)
const USE_DIRECT_OLLAMA = config.opencode?.use_direct !== false

// ============================================================================
// Direct Ollama API
// ============================================================================

/**
 * Extract model name from ollama/ prefixed model ID
 * @param {string} model - Model ID (e.g., 'ollama/qwen3:32b')
 * @returns {string} Model name for ollama API
 */
function extract_ollama_model_name(model) {
  if (model.startsWith('ollama/')) {
    return model.slice(7)
  }
  return model
}

/**
 * Call Ollama API directly
 *
 * @param {Object} params
 * @param {string} params.prompt - The prompt to send
 * @param {string} params.model - Model ID (ollama/model:tag format)
 * @param {number} [params.timeout_ms] - Timeout in milliseconds
 * @param {object} [params.format] - JSON schema for structured output (Ollama format parameter)
 * @returns {Promise<{output: string, duration_ms: number}>} Response and execution time
 */
async function call_ollama_direct({
  prompt,
  model,
  timeout_ms = TIMEOUT_MS,
  format = null
}) {
  const model_name = extract_ollama_model_name(model)
  const url = `${OLLAMA_BASE_URL}/api/generate`

  log(`Calling Ollama directly: ${model_name}`)
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

// ============================================================================
// OpenCode Execution
// ============================================================================

/**
 * Execute OpenCode CLI with the given prompt and model
 *
 * @param {Object} params
 * @param {string} params.prompt - The prompt to send to OpenCode
 * @param {string} [params.model] - Model to use
 * @param {number} [params.timeout_ms] - Timeout in milliseconds
 * @param {string} [params.mode] - OpenCode mode (e.g., 'plan' to reduce tool usage)
 * @param {object} [params.format] - JSON schema for structured output (passed to Ollama format parameter)
 * @returns {Promise<{output: string, duration_ms: number}>} Raw output and execution time
 */
export const run_opencode = async ({
  prompt,
  model = DEFAULT_MODEL,
  timeout_ms = TIMEOUT_MS,
  mode = null,
  format = null
}) => {
  if (!prompt) {
    throw new Error('prompt is required')
  }

  // Use direct Ollama API for ollama models (faster, more reliable)
  if (USE_DIRECT_OLLAMA && model.startsWith('ollama/')) {
    return call_ollama_direct({ prompt, model, timeout_ms, format })
  }

  log(`Running OpenCode with model: ${model}${mode ? `, mode: ${mode}` : ''}`)
  const start_time = Date.now()

  return new Promise((resolve, reject) => {
    const args = ['run', '-m', model]
    if (mode) {
      args.push('--mode', mode)
    }
    args.push(prompt)
    const process_handle = spawn(BINARY_PATH, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env }
    })

    let stdout = ''
    let stderr = ''

    process_handle.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    process_handle.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    const timeout_handle = setTimeout(() => {
      process_handle.kill('SIGTERM')
      reject(new Error(`OpenCode timed out after ${timeout_ms}ms`))
    }, timeout_ms)

    process_handle.on('close', (code) => {
      clearTimeout(timeout_handle)
      const duration_ms = Date.now() - start_time

      if (code !== 0) {
        log(`OpenCode exited with code ${code}: ${stderr}`)
        reject(new Error(`OpenCode exited with code ${code}: ${stderr}`))
        return
      }

      log(`OpenCode completed in ${duration_ms}ms`)
      resolve({
        output: stdout,
        duration_ms
      })
    })

    process_handle.on('error', (error) => {
      clearTimeout(timeout_handle)
      log(`OpenCode process error: ${error.message}`)
      reject(new Error(`Failed to spawn OpenCode: ${error.message}`))
    })
  })
}

/**
 * Strip ANSI escape codes from OpenCode output
 *
 * @param {string} output - Raw output from OpenCode
 * @returns {string} Cleaned output
 */
export const strip_ansi_codes = (output) => {
  // eslint-disable-next-line no-control-regex
  return output.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')
}

/**
 * Extract model response from OpenCode output
 * Removes the banner and other CLI artifacts
 *
 * @param {string} output - Raw output from OpenCode
 * @returns {string} Model response text
 */
export const extract_model_response = (output) => {
  const cleaned = strip_ansi_codes(output)

  // OpenCode output format:
  // - Banner at top (may include model info)
  // - Blank lines
  // - Model response
  // - Usage stats at bottom

  const lines = cleaned.split('\n')

  // Find the start of actual content (skip banner lines)
  let content_start = 0
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    // Skip empty lines and banner lines (contain special chars or are very short status lines)
    if (
      line === '' ||
      line.startsWith('opencode') ||
      line.includes('───') ||
      line.includes('│') ||
      line.includes('╭') ||
      line.includes('╰')
    ) {
      content_start = i + 1
      continue
    }
    break
  }

  // Find the end of content (before usage stats)
  let content_end = lines.length
  for (let i = lines.length - 1; i >= content_start; i--) {
    const line = lines[i].trim()
    if (
      line === '' ||
      line.includes('tokens') ||
      line.includes('cost') ||
      line.includes('───') ||
      line.includes('│') ||
      line.includes('╭') ||
      line.includes('╰')
    ) {
      content_end = i
      continue
    }
    break
  }

  return lines
    .slice(content_start, content_end + 1)
    .join('\n')
    .trim()
}

export default run_opencode
