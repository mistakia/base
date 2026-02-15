/**
 * Client-side pricing calculator for thread costs
 */

/**
 * Format cost value for display
 */
export function format_cost(cost, currency = 'USD') {
  if (cost === null || cost === undefined || isNaN(cost)) {
    return null
  }

  // Handle very small costs (less than $0.01)
  if (cost < 0.01 && cost > 0) {
    return '<$0.01'
  }

  if (cost === 0) {
    return '$0.00'
  }

  return cost.toLocaleString('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 4
  })
}

/**
 * Get model key from thread metadata
 */
function get_model_key(thread_metadata) {
  // Try to extract provider and model from thread metadata
  const provider = thread_metadata.inference_provider
  const model =
    (thread_metadata.models && thread_metadata.models[0]) ||
    (thread_metadata.source?.provider_metadata?.models &&
      Array.isArray(thread_metadata.source.provider_metadata.models) &&
      thread_metadata.source.provider_metadata.models[0])

  if (!provider || !model) {
    return null
  }

  return `${provider}:${model}`
}

/**
 * Get model pricing data from models data
 */
function get_model_pricing(models_data, model_key) {
  if (!models_data || !model_key) {
    return null
  }

  const model = models_data[model_key]
  return model?.pricing || null
}

/**
 * Calculate cost using specific token types (input, output, cache)
 */
function calculate_specific_token_costs(thread_metadata, pricing) {
  const costs = {}
  let total_cost = 0
  let has_all_required_data = true

  // Input tokens cost
  if (thread_metadata.input_tokens && pricing.input_cost_per_token) {
    costs.input_tokens_cost =
      thread_metadata.input_tokens * pricing.input_cost_per_token
    total_cost += costs.input_tokens_cost
  } else if (thread_metadata.input_tokens) {
    has_all_required_data = false
  }

  // Output tokens cost
  if (thread_metadata.output_tokens && pricing.output_cost_per_token) {
    costs.output_tokens_cost =
      thread_metadata.output_tokens * pricing.output_cost_per_token
    total_cost += costs.output_tokens_cost
  } else if (thread_metadata.output_tokens) {
    has_all_required_data = false
  }

  // Cache read tokens cost (optional)
  if (
    thread_metadata.cache_read_input_tokens &&
    pricing.cache_read_cost_per_token
  ) {
    costs.cache_read_cost =
      thread_metadata.cache_read_input_tokens *
      pricing.cache_read_cost_per_token
    total_cost += costs.cache_read_cost
  }

  // Cache write tokens cost (optional)
  if (
    thread_metadata.cache_creation_input_tokens &&
    pricing.cache_write_cost_per_token
  ) {
    costs.cache_write_cost =
      thread_metadata.cache_creation_input_tokens *
      pricing.cache_write_cost_per_token
    total_cost += costs.cache_write_cost
  }

  return {
    total_cost,
    breakdown: costs,
    has_complete_data: has_all_required_data && total_cost > 0
  }
}

/**
 * Calculate estimated cost using total tokens
 */
function calculate_estimated_cost(thread_metadata, pricing) {
  // Use total tokens as a rough estimate
  // Assume 60% input tokens, 40% output tokens as a typical distribution
  const total_tokens =
    (thread_metadata.input_tokens || 0) + (thread_metadata.output_tokens || 0)

  if (
    !total_tokens ||
    !pricing.input_cost_per_token ||
    !pricing.output_cost_per_token
  ) {
    return null
  }

  const estimated_input_tokens = total_tokens * 0.6
  const estimated_output_tokens = total_tokens * 0.4

  const estimated_cost =
    estimated_input_tokens * pricing.input_cost_per_token +
    estimated_output_tokens * pricing.output_cost_per_token

  return {
    total_cost: estimated_cost,
    breakdown: {
      estimated_input_cost:
        estimated_input_tokens * pricing.input_cost_per_token,
      estimated_output_cost:
        estimated_output_tokens * pricing.output_cost_per_token
    },
    has_complete_data: false
  }
}

/**
 * Main function to calculate thread cost
 *
 * @param {Object} thread_metadata - Thread metadata containing token counts and model info
 * @param {Object} models_data - Cached models pricing data
 * @returns {Object|null} Cost calculation result or null if unavailable
 */
export function calculate_thread_cost(thread_metadata, models_data) {
  if (!thread_metadata || !models_data) {
    return null
  }

  // Get model pricing data
  const model_key = get_model_key(thread_metadata)
  const pricing = get_model_pricing(models_data, model_key)

  if (!pricing) {
    return {
      error: 'Pricing data not available for this model',
      model_key
    }
  }

  // Handle free models
  if (pricing.free_tier) {
    return {
      total_cost: 0,
      currency: pricing.currency || 'USD',
      is_estimate: false,
      is_free: true,
      breakdown: {
        input_tokens_cost: 0,
        output_tokens_cost: 0
      }
    }
  }

  // Try to calculate with specific token types first
  let calculation = calculate_specific_token_costs(thread_metadata, pricing)
  let is_estimate = !calculation.has_complete_data

  // If we don't have complete specific data, try estimation
  if (
    !calculation.has_complete_data &&
    (thread_metadata.input_tokens || thread_metadata.output_tokens)
  ) {
    const estimated_calculation = calculate_estimated_cost(
      thread_metadata,
      pricing
    )
    if (estimated_calculation) {
      calculation = estimated_calculation
      is_estimate = true
    }
  }

  // If we still don't have a calculation, return null
  if (!calculation || calculation.total_cost <= 0) {
    return {
      error: 'Insufficient data for cost calculation',
      model_key
    }
  }

  return {
    total_cost: calculation.total_cost,
    currency: pricing.currency || 'USD',
    is_estimate,
    is_free: false,
    breakdown: calculation.breakdown,
    model_key
  }
}

/**
 * Format cost for display in UI components
 *
 * @param {Object} cost_calculation - Result from calculate_thread_cost
 * @returns {string|null} Formatted cost string for display
 */
export function format_cost_for_display(cost_calculation) {
  if (!cost_calculation) {
    return null
  }

  if (cost_calculation.error) {
    return null // Don't show errors in UI, just return null
  }

  if (cost_calculation.is_free) {
    return 'Free'
  }

  const formatted_cost = format_cost(
    cost_calculation.total_cost,
    cost_calculation.currency
  )

  if (!formatted_cost) {
    return null
  }

  return cost_calculation.is_estimate ? `~${formatted_cost}` : formatted_cost
}
