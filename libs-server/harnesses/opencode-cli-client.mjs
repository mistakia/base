import { spawn } from 'child_process'
import debug from 'debug'
import config from '#config'

const log = debug('harness:opencode-cli')

const DEFAULT_TIMEOUT_MS = config.model_roles?.default_timeout_ms || 300000
const BINARY_PATH =
  process.env.MODEL_ROLES_OPENCODE_CLI_BINARY_PATH ||
  config.model_roles?.harness_providers?.['opencode-cli']?.binary_path ||
  'opencode'

/**
 * Spawn the OpenCode CLI binary and capture its output.
 *
 * @param {Object} params
 * @param {string} params.prompt
 * @param {string} params.model
 * @param {number} [params.timeout_ms]
 * @param {string} [params.mode]
 * @returns {Promise<{output: string, duration_ms: number}>}
 */
export const run_opencode_cli = ({
  prompt,
  model,
  timeout_ms = DEFAULT_TIMEOUT_MS,
  mode = null
}) => {
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

export const strip_ansi_codes = (output) => {
  // eslint-disable-next-line no-control-regex
  return output.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')
}

/**
 * Extract the model response from raw OpenCode CLI output, stripping the
 * banner and trailing usage stats.
 */
export const extract_model_response = (output) => {
  const cleaned = strip_ansi_codes(output)

  const lines = cleaned.split('\n')

  let content_start = 0
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
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
