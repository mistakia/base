import debug from 'debug'

import { call_ollama } from '#libs-server/llm/ollama-client.mjs'
import { call_mlx } from '#libs-server/llm/mlx-client.mjs'
import { load_review_config } from './review-config.mjs'

const log = debug('content-review:tier-classifier')

/**
 * Dispatch a tier-classification LLM call to the configured backend.
 * Mirrors call_ollama signature so analyze-content.mjs can drop this in.
 *
 * @param {object} options
 * @param {string} options.prompt
 * @param {string} [options.model] - Falls back to tier_classifier.model
 * @param {number} [options.timeout_ms] - Falls back to review_config.timeout_ms
 * @param {object} [options.format] - JSON schema for structured output
 * @returns {Promise<{output: string, duration_ms: number}>}
 */
export async function call_tier_classifier({
  prompt,
  system,
  model,
  timeout_ms,
  format
}) {
  const review_config = await load_review_config()
  const tc = review_config.tier_classifier || {}
  const backend = tc.backend || 'ollama'
  const resolved_model = tc.model || model || review_config.default_model
  const resolved_timeout = timeout_ms ?? review_config.timeout_ms

  log('dispatch backend=%s model=%s', backend, resolved_model)

  if (backend === 'mlx') {
    return call_mlx({
      prompt,
      system,
      model: resolved_model,
      base_url: tc.endpoint,
      timeout_ms: resolved_timeout,
      format,
      max_tokens: tc.max_tokens
    })
  }

  if (backend === 'ollama') {
    const merged = system ? `${system}\n\n${prompt}` : prompt
    return call_ollama({
      prompt: merged,
      model: resolved_model,
      base_url: tc.endpoint,
      timeout_ms: resolved_timeout,
      format
    })
  }

  throw new Error(`Unknown tier_classifier.backend: ${backend}`)
}
