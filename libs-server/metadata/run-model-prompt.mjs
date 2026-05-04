import { call_ollama } from '#libs-server/llm/ollama-client.mjs'
import { run_opencode_cli } from '#libs-server/harnesses/opencode-cli-client.mjs'

// Transitional defaults — replaced by role-driven dispatch in the follow-up dispatcher task.
const DEFAULT_MODEL = 'ollama/gemma4:26b'
const DEFAULT_TIMEOUT_MS = 300000

/**
 * Send a prompt to a model and return its output.
 *
 * Ollama and OpenCode are two different classes of thing: Ollama prompts a
 * model directly (single completion, no tool use); OpenCode runs an agentic
 * CLI session. This dispatcher hides that distinction behind a single
 * prompt-in/output-out surface because every current call site only needs
 * a text completion. When the model ID has the `ollama/` prefix, the call
 * goes straight to the Ollama HTTP API (the common, fast path); otherwise
 * it is routed through the OpenCode CLI.
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

  if (model.startsWith('ollama/')) {
    return call_ollama({ prompt, model, timeout_ms, format })
  }

  return run_opencode_cli({ prompt, model, timeout_ms, mode })
}

export {
  extract_model_response,
  strip_ansi_codes
} from '#libs-server/harnesses/opencode-cli-client.mjs'
