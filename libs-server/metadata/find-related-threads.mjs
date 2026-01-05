/**
 * Find related threads using LLM classification
 *
 * Uses LLM to identify threads that share the same work domain
 * based on title and short description.
 */

import debug from 'debug'
import {
  run_opencode,
  extract_model_response
} from './run-opencode-analysis.mjs'

const log = debug('metadata:find-related-threads')

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_MODEL = 'anthropic/claude-haiku-4-5-20251001'

// ============================================================================
// Prompt Generation
// ============================================================================

/**
 * Generate the classification prompt for finding related threads
 * @param {Object} params
 * @param {Object} params.target_thread - Target thread metadata
 * @param {Array} params.candidate_threads - Array of candidate thread metadata
 * @returns {string} Formatted prompt
 */
export function generate_relation_prompt({ target_thread, candidate_threads }) {
  const target_title = target_thread.title || 'Untitled'
  const target_desc = target_thread.short_description || 'No description'

  const candidates_list = candidate_threads
    .map((thread, index) => {
      const title = thread.title || 'Untitled'
      const desc = thread.short_description || 'No description'
      return `${index + 1}. "${title}" - ${desc}`
    })
    .join('\n')

  return `You are a classification assistant. ONLY respond with the requested format. DO NOT execute any commands or access files.

Classify which candidates share the same work domain as TARGET based on the information provided.

TARGET: "${target_title}" - ${target_desc}

CANDIDATES:
${candidates_list}

Output ONLY: comma-separated numbers of related candidates, nothing else.`
}

// ============================================================================
// Response Parsing
// ============================================================================

/**
 * Parse the LLM response to extract candidate numbers
 * @param {Object} params
 * @param {string} params.response - Raw LLM response
 * @param {number} params.max_candidate - Maximum valid candidate number
 * @returns {Array<number>} Array of valid candidate indices (0-based)
 */
export function parse_relation_response({ response, max_candidate }) {
  if (!response || typeof response !== 'string') {
    return []
  }

  // Clean up the response
  const cleaned = response.trim()

  // Handle "none" or empty responses
  if (cleaned.toLowerCase() === 'none' || cleaned === '' || cleaned === '0') {
    return []
  }

  // Extract numbers from the response
  const numbers = cleaned.match(/\d+/g)
  if (!numbers) {
    return []
  }

  // Convert to 0-based indices and filter valid ones
  const indices = numbers
    .map((n) => parseInt(n, 10) - 1) // Convert to 0-based
    .filter((n) => n >= 0 && n < max_candidate)

  // Deduplicate
  return [...new Set(indices)]
}

// ============================================================================
// Main Export
// ============================================================================

/**
 * Find threads related to the target thread using LLM classification
 * @param {Object} params
 * @param {Object} params.thread - Target thread metadata
 * @param {Array} params.recent_threads - Array of candidate thread metadata
 * @param {string} [params.model] - Model to use for classification
 * @returns {Promise<Object>} { related_thread_ids: [...], duration_ms }
 */
export async function find_related_threads({
  thread,
  recent_threads,
  model = DEFAULT_MODEL
}) {
  if (!thread || !recent_threads || recent_threads.length === 0) {
    return { related_thread_ids: [], duration_ms: 0 }
  }

  // Filter out the target thread from candidates
  const candidates = recent_threads.filter(
    (t) => t.thread_id !== thread.thread_id
  )

  if (candidates.length === 0) {
    return { related_thread_ids: [], duration_ms: 0 }
  }

  log(
    `Finding related threads for "${thread.title}" among ${candidates.length} candidates`
  )

  // Generate prompt
  const prompt = generate_relation_prompt({
    target_thread: thread,
    candidate_threads: candidates
  })

  try {
    // Call LLM with plan mode to reduce tool usage
    const { output, duration_ms } = await run_opencode({
      prompt,
      model,
      mode: 'plan'
    })

    // Extract and parse response
    const response = extract_model_response(output)
    log(`LLM response: ${response}`)

    const indices = parse_relation_response({
      response,
      max_candidate: candidates.length
    })

    // Map indices back to thread IDs
    const related_thread_ids = indices.map((i) => candidates[i].thread_id)

    log(
      `Found ${related_thread_ids.length} related threads in ${duration_ms}ms`
    )

    return { related_thread_ids, duration_ms }
  } catch (error) {
    log(`Error finding related threads: ${error.message}`)
    return { related_thread_ids: [], duration_ms: 0, error: error.message }
  }
}

export default find_related_threads
