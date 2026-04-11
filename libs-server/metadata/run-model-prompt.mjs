import config from '#config'
import { call_ollama } from './ollama-client.mjs'
import { run_opencode_cli } from './opencode-cli-client.mjs'

const DEFAULT_MODEL = config.opencode?.default_model || 'ollama/qwen2.5:72b'
const DEFAULT_TIMEOUT_MS = config.opencode?.timeout_ms || 120000
const USE_DIRECT_OLLAMA = config.opencode?.use_direct !== false

/**
 * Send a prompt to a model and return its output.
 *
 * Ollama and OpenCode are two different classes of thing: Ollama prompts a
 * model directly (single completion, no tool use); OpenCode runs an agentic
 * CLI session. This dispatcher hides that distinction behind a single
 * prompt-in/output-out surface because every current call site only needs
 * a text completion. When USE_DIRECT_OLLAMA is enabled and the model ID
 * has the `ollama/` prefix, the call goes straight to the Ollama HTTP API
 * (the common, fast path); otherwise it is routed through the OpenCode CLI.
 *
 * @param {Object} params
 * @param {string} params.prompt
 * @param {string} [params.model]
 * @param {number} [params.timeout_ms]
 * @param {string} [params.mode]   - OpenCode-only mode flag, ignored on the Ollama path
 * @param {object} [params.format] - Ollama JSON schema output, ignored on the OpenCode path
 * @returns {Promise<{output: string, duration_ms: number}>}
 */
export const run_model_prompt = async ({
  prompt,
  model = DEFAULT_MODEL,
  timeout_ms = DEFAULT_TIMEOUT_MS,
  mode = null,
  format = null
}) => {
  if (!prompt) {
    throw new Error('prompt is required')
  }

  if (USE_DIRECT_OLLAMA && model.startsWith('ollama/')) {
    return call_ollama({ prompt, model, timeout_ms, format })
  }

  return run_opencode_cli({ prompt, model, timeout_ms, mode })
}

export {
  extract_model_response,
  strip_ansi_codes
} from './opencode-cli-client.mjs'
