import config from '#config'
import { call_inference } from '#libs-server/llm/inference-client.mjs'

/**
 * Parse a prefixed model identifier of the form `<provider>/<model>`.
 *
 * Throws on input without a slash. Bare model names (e.g. `gemma4:26b`) are
 * intentionally rejected — callers must always use the prefixed form
 * (e.g. `ollama/gemma4:26b`).
 *
 * @param {string} prefixed
 * @returns {{provider: string, model: string}}
 */
export const parse_model_id = (prefixed) => {
  if (typeof prefixed !== 'string' || !prefixed.includes('/')) {
    throw new Error(
      `parse_model_id requires "<provider>/<model>" format; got "${prefixed}"`
    )
  }
  const slash_index = prefixed.indexOf('/')
  return {
    provider: prefixed.slice(0, slash_index),
    model: prefixed.slice(slash_index + 1)
  }
}

/**
 * Low-level model dispatch. Looks up the inference endpoint by provider in
 * `config.model_roles.inference_providers[provider].endpoint`, applies
 * top-level defaults for `timeout_ms` and `temperature`, and forwards to
 * `call_inference`. Used by benches that sweep arbitrary model strings.
 *
 * @param {Object} params
 * @param {string} params.provider
 * @param {string} params.model
 * @param {string} params.prompt
 * @param {string} [params.system]
 * @param {object} [params.format]
 * @param {number} [params.max_tokens]
 * @param {number} [params.temperature]
 * @param {number} [params.timeout_ms]
 * @returns {Promise<{output: string, duration_ms: number}>}
 */
export const dispatch_model = async ({
  provider,
  model,
  prompt,
  system,
  format,
  max_tokens,
  temperature,
  timeout_ms
}) => {
  const model_roles = config.model_roles
  const provider_config = model_roles?.inference_providers?.[provider]
  if (!provider_config) {
    throw new Error(`Unknown inference provider: ${provider}`)
  }
  const endpoint = provider_config.endpoint

  const effective_timeout_ms =
    timeout_ms ?? model_roles?.default_timeout_ms
  const effective_temperature =
    temperature ?? model_roles?.default_temperature ?? 0

  return call_inference({
    provider,
    endpoint,
    model,
    prompt,
    system,
    format,
    max_tokens,
    temperature: effective_temperature,
    timeout_ms: effective_timeout_ms
  })
}
