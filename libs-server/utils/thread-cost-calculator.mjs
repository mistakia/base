/**
 * @fileoverview Server-side thread cost calculator
 *
 * Calculates thread costs using token counts and model pricing data.
 * Ported from client/core/utils/pricing-calculator.js for server-side use.
 */

import debug from 'debug'
import { get_models_from_cache } from './models-cache.mjs'
import { to_number } from './to-number.mjs'

const log = debug('utils:thread-cost')

/**
 * Get model key from thread data
 *
 * @param {Object} thread_data - Thread data with inference_provider and model info
 * @returns {string|null} Model key in format "provider:model" or null
 */
function get_model_key(thread_data) {
  const provider = thread_data.inference_provider
  const model =
    thread_data.primary_model ||
    (thread_data.models && thread_data.models[0]) ||
    (thread_data.external_session?.provider_metadata?.models &&
      thread_data.external_session.provider_metadata.models[0])

  if (!provider || !model) {
    return null
  }

  return `${provider}:${model}`
}

/**
 * Get model pricing from cached models data
 *
 * @param {Object} models_data - Cached models data
 * @param {string} model_key - Model key in format "provider:model"
 * @returns {Object|null} Pricing data or null
 */
function get_model_pricing(models_data, model_key) {
  if (!models_data || !model_key) {
    return null
  }

  const model = models_data[model_key]
  return model?.pricing || null
}

/**
 * Calculate cost using specific token types
 *
 * @param {Object} thread_data - Thread data with token counts
 * @param {Object} pricing - Model pricing data
 * @returns {Object} Cost calculation result
 */
function calculate_token_costs(thread_data, pricing) {
  const costs = {}
  let total_cost = 0

  // Get token counts - check both direct fields and nested paths
  // Use nullish coalescing (??) to preserve explicit zeros
  // Convert BigInts from DuckDB to Numbers for arithmetic operations
  // Cost is based on cumulative_* (sum across every turn — each turn pays
  // separately for its input, cache writes, cache reads, and output).
  const provider_metadata = thread_data.external_session?.provider_metadata
  const input_tokens = to_number(
    thread_data.cumulative_input_tokens ??
      provider_metadata?.cumulative_input_tokens
  )

  const output_tokens = to_number(
    thread_data.cumulative_output_tokens ??
      provider_metadata?.cumulative_output_tokens
  )

  const cache_read_tokens = to_number(
    thread_data.cumulative_cache_read_input_tokens ??
      provider_metadata?.cumulative_cache_read_input_tokens
  )

  const cache_creation_tokens = to_number(
    thread_data.cumulative_cache_creation_input_tokens ??
      provider_metadata?.cumulative_cache_creation_input_tokens
  )

  // Input tokens cost
  if (input_tokens && pricing.input_cost_per_token) {
    costs.input_tokens_cost = input_tokens * pricing.input_cost_per_token
    total_cost += costs.input_tokens_cost
  }

  // Output tokens cost
  if (output_tokens && pricing.output_cost_per_token) {
    costs.output_tokens_cost = output_tokens * pricing.output_cost_per_token
    total_cost += costs.output_tokens_cost
  }

  // Cache read tokens cost
  if (cache_read_tokens && pricing.cache_read_cost_per_token) {
    costs.cache_read_cost =
      cache_read_tokens * pricing.cache_read_cost_per_token
    total_cost += costs.cache_read_cost
  }

  // Cache creation tokens cost
  if (cache_creation_tokens && pricing.cache_write_cost_per_token) {
    costs.cache_creation_cost =
      cache_creation_tokens * pricing.cache_write_cost_per_token
    total_cost += costs.cache_creation_cost
  }

  return {
    total_cost,
    breakdown: costs,
    has_data: total_cost > 0
  }
}

/**
 * Calculate thread cost
 *
 * @param {Object} thread_data - Thread data with token counts and model info
 * @param {Object} models_data - Cached models data (optional, will fetch if not provided)
 * @returns {Object} Cost calculation result
 */
export function calculate_thread_cost(thread_data, models_data) {
  if (!thread_data) {
    return {
      total_cost: 0,
      input_cost: 0,
      output_cost: 0,
      currency: 'USD',
      error: 'No thread data provided'
    }
  }

  const model_key = get_model_key(thread_data)

  if (!model_key) {
    return {
      total_cost: 0,
      input_cost: 0,
      output_cost: 0,
      currency: 'USD',
      error: 'Missing inference_provider or model'
    }
  }

  if (!models_data) {
    return {
      total_cost: 0,
      input_cost: 0,
      output_cost: 0,
      currency: 'USD',
      error: 'Models data not available'
    }
  }

  const pricing = get_model_pricing(models_data, model_key)

  if (!pricing) {
    return {
      total_cost: 0,
      input_cost: 0,
      output_cost: 0,
      currency: 'USD',
      model_key,
      error: 'Pricing data not available for model'
    }
  }

  // Handle free models
  if (pricing.free_tier) {
    return {
      total_cost: 0,
      input_cost: 0,
      output_cost: 0,
      currency: pricing.currency || 'USD',
      is_free: true,
      model_key
    }
  }

  const calculation = calculate_token_costs(thread_data, pricing)

  return {
    total_cost: calculation.total_cost,
    input_cost: calculation.breakdown.input_tokens_cost || 0,
    output_cost: calculation.breakdown.output_tokens_cost || 0,
    cache_read_cost: calculation.breakdown.cache_read_cost || 0,
    cache_creation_cost: calculation.breakdown.cache_creation_cost || 0,
    currency: pricing.currency || 'USD',
    model_key,
    has_data: calculation.has_data
  }
}

/**
 * Calculate thread cost with automatic models data fetching
 *
 * @param {Object} thread_data - Thread data with token counts and model info
 * @returns {Promise<Object>} Cost calculation result
 */
export async function calculate_thread_cost_async(thread_data) {
  try {
    const cache_data = await get_models_from_cache()

    if (!cache_data?.models) {
      log('Models cache not available for cost calculation')
      return {
        total_cost: 0,
        input_cost: 0,
        output_cost: 0,
        currency: 'USD',
        error: 'Models cache not available'
      }
    }

    return calculate_thread_cost(thread_data, cache_data.models)
  } catch (error) {
    log('Error calculating thread cost: %s', error.message)
    return {
      total_cost: 0,
      input_cost: 0,
      output_cost: 0,
      currency: 'USD',
      error: error.message
    }
  }
}

/**
 * Format cost for display
 *
 * @param {number} cost - Cost value
 * @param {string} currency - Currency code (default: USD)
 * @returns {string|null} Formatted cost string
 */
export function format_cost(cost, currency = 'USD') {
  if (cost === null || cost === undefined || isNaN(cost)) {
    return null
  }

  if (cost === 0) {
    return '$0.00'
  }

  // Handle very small costs
  if (cost < 0.01 && cost > 0) {
    return '<$0.01'
  }

  return cost.toLocaleString('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 4
  })
}

export default {
  calculate_thread_cost,
  calculate_thread_cost_async,
  format_cost
}
