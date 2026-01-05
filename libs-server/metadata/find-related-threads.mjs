/**
 * Find related threads using LLM classification
 *
 * Uses LLM to identify semantically related threads based on
 * shared work domains, projects, and technical areas.
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

const DEFAULT_MODEL = 'ollama/qwen2.5:72b'

// Supported model aliases for CLI convenience
export const SUPPORTED_MODELS = {
  'qwen2.5:72b': 'ollama/qwen2.5:72b',
  'qwen2.5': 'ollama/qwen2.5:72b',
  qwen: 'ollama/qwen2.5:72b',
  default: 'ollama/qwen2.5:72b'
}

// Scoring weights for pre-filtering candidates
const SCORING = {
  SAME_REPOSITORY: 3, // Strong signal - same repo likely related
  KEYWORD_OVERLAP: 0.5, // Per overlapping keyword in title
  TIME_DECAY_DAYS: 30, // Days until time proximity score reaches 0
  MIN_KEYWORD_LENGTH: 3 // Minimum word length to consider for overlap
}

// Pre-filter settings
const PREFILTER = {
  DEFAULT_MAX_CANDIDATES: 30
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get working directory from thread metadata
 * @param {Object} thread - Thread metadata object
 * @returns {string|null} Working directory path or null
 */
function get_working_directory(thread) {
  return thread?.external_session?.provider_metadata?.working_directory || null
}

/**
 * Extract repository name from working directory path
 * @param {string} working_directory - Full path to working directory
 * @returns {string|null} Repository name or null
 */
export function extract_repository_name(working_directory) {
  if (!working_directory) return null
  const parts = working_directory.split('/')
  return parts[parts.length - 1] || null
}

/**
 * Get repository name from thread metadata
 * @param {Object} thread - Thread metadata object
 * @returns {string|null} Repository name or null
 */
function get_repository_name(thread) {
  return extract_repository_name(get_working_directory(thread))
}

/**
 * Calculate time proximity score between two dates
 * Threads closer in time are more likely to be related
 * @param {string} date1 - ISO date string
 * @param {string} date2 - ISO date string
 * @returns {number} Score from 0 to 1 (1 = same day, 0 = > TIME_DECAY_DAYS apart)
 */
export function calculate_time_proximity(date1, date2) {
  if (!date1 || !date2) return 0
  const d1 = new Date(date1)
  const d2 = new Date(date2)
  const diff_days = Math.abs(d1 - d2) / (1000 * 60 * 60 * 24)
  return Math.max(0, 1 - diff_days / SCORING.TIME_DECAY_DAYS)
}

/**
 * Extract keywords from title for overlap comparison
 * @param {string} title - Thread title
 * @returns {string[]} Array of lowercase keywords
 */
function extract_title_keywords(title) {
  return (title || '')
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > SCORING.MIN_KEYWORD_LENGTH)
}

// ============================================================================
// Pre-filtering Functions
// ============================================================================

/**
 * Pre-filter and score candidate threads based on metadata similarity
 * @param {Object} params
 * @param {Object} params.target_thread - Target thread metadata
 * @param {Array} params.candidate_threads - Array of candidate thread metadata
 * @param {number} [params.max_candidates] - Maximum candidates to return
 * @returns {Array} Filtered and scored candidate threads
 */
export function prefilter_candidates({
  target_thread,
  candidate_threads,
  max_candidates = PREFILTER.DEFAULT_MAX_CANDIDATES
}) {
  const target_repo = get_repository_name(target_thread)
  const target_date = target_thread.updated_at || target_thread.created_at
  const target_keywords = new Set(extract_title_keywords(target_thread.title))

  const scored_candidates = candidate_threads.map((thread) => {
    let score = 0

    // Same repository boost (strongest signal)
    const candidate_repo = get_repository_name(thread)
    if (target_repo && candidate_repo && target_repo === candidate_repo) {
      score += SCORING.SAME_REPOSITORY
    }

    // Time proximity score
    const thread_date = thread.updated_at || thread.created_at
    score += calculate_time_proximity(target_date, thread_date)

    // Title keyword overlap
    const thread_keywords = extract_title_keywords(thread.title)
    const overlap = thread_keywords.filter((w) => target_keywords.has(w)).length
    score += overlap * SCORING.KEYWORD_OVERLAP

    return { ...thread, _prefilter_score: score }
  })

  return scored_candidates
    .sort((a, b) => b._prefilter_score - a._prefilter_score)
    .slice(0, max_candidates)
}

// ============================================================================
// Prompt Generation
// ============================================================================

/**
 * Generate the classification prompt for finding related threads
 * @param {Object} params
 * @param {Object} params.target_thread - Target thread metadata
 * @param {Array} params.candidate_threads - Array of candidate thread metadata
 * @param {boolean} [params.use_json_output=false] - Request JSON output format
 * @returns {string} Formatted prompt
 */
export function generate_relation_prompt({
  target_thread,
  candidate_threads,
  use_json_output = false
}) {
  const target_title = target_thread.title || 'Untitled'
  const target_desc = target_thread.short_description || 'No description'
  const target_repo = get_repository_name(target_thread)

  const candidates_list = candidate_threads
    .map((thread, index) => {
      const title = thread.title || 'Untitled'
      const desc = thread.short_description || 'No description'
      const repo = get_repository_name(thread)
      const repo_info = repo ? ` [${repo}]` : ''
      return `${index + 1}. "${title}"${repo_info} - ${desc}`
    })
    .join('\n')

  const target_repo_info = target_repo ? ` [Repository: ${target_repo}]` : ''

  if (use_json_output) {
    return `You are a thread relation classifier. Identify which candidate threads are semantically related to the target thread.

DEFINITION OF RELATED:
- Work on the same feature, bug, or task (even across multiple sessions)
- Part of the same project or system component
- Share technical domain (e.g., both about database migrations, both about UI styling)
- One builds on or continues work from another

NOT RELATED (avoid false positives):
- Merely using similar tools (e.g., both use git, both use testing frameworks)
- Generic development tasks in the same repository but unrelated domains
- Coincidental keyword overlap without semantic connection

TARGET:${target_repo_info}
"${target_title}" - ${target_desc}

CANDIDATES:
${candidates_list}

Respond with JSON only:
{"related": [{"id": <number>, "confidence": "high"|"medium"|"low"}], "reasoning": "<brief explanation>"}

If no candidates are related, respond: {"related": [], "reasoning": "<explanation>"}`
  }

  return `You are a classification assistant. ONLY respond with the requested format. DO NOT execute any commands or access files.

Identify threads that are SEMANTICALLY RELATED to the target - meaning they:
- Work on the same feature, bug, or task
- Are part of the same project component
- Share the same technical domain (e.g., database work, UI changes, API development)

Do NOT mark as related if they only:
- Happen to use similar tools
- Are in the same repository but work on unrelated features
- Have coincidental keyword overlap

TARGET:${target_repo_info}
"${target_title}" - ${target_desc}

CANDIDATES:
${candidates_list}

Output ONLY: comma-separated numbers of related candidates (or "none" if no matches)`
}

// ============================================================================
// Response Parsing
// ============================================================================

/**
 * Check if response looks like JSON
 * @param {string} response - Cleaned response string
 * @returns {boolean}
 */
function looks_like_json(response) {
  return response.startsWith('{') || response.includes('{"related"')
}

/**
 * Try to parse JSON from response, extracting candidate data
 * @param {string} response - Raw response string
 * @param {number} max_candidate - Maximum valid candidate number
 * @returns {Object|null} Parsed result or null if parsing fails
 */
function try_parse_json(response, max_candidate) {
  try {
    // Extract JSON from response (handle markdown wrapping)
    let json_str = response.trim()
    const json_match = json_str.match(/\{[\s\S]*\}/)
    if (json_match) {
      json_str = json_match[0]
    }

    const parsed = JSON.parse(json_str)

    if (!Array.isArray(parsed.related)) {
      return null
    }

    const indices = []
    const confidence_map = new Map()

    for (const item of parsed.related) {
      const id =
        typeof item === 'number'
          ? item
          : typeof item.id === 'number'
            ? item.id
            : parseInt(item.id, 10)
      const index = id - 1 // Convert to 0-based

      if (index >= 0 && index < max_candidate) {
        indices.push(index)
        if (item.confidence) {
          confidence_map.set(index, item.confidence)
        }
      }
    }

    return {
      indices: [...new Set(indices)],
      confidence_map,
      reasoning: parsed.reasoning || ''
    }
  } catch {
    return null
  }
}

/**
 * Extract candidate numbers from text response
 * @param {string} response - Response text
 * @param {number} max_candidate - Maximum valid candidate number
 * @returns {number[]} Array of valid 0-based indices
 */
function extract_candidate_numbers(response, max_candidate) {
  const numbers = response.match(/\d+/g)
  if (!numbers) {
    return []
  }

  const indices = numbers
    .map((n) => parseInt(n, 10) - 1) // Convert to 0-based
    .filter((n) => n >= 0 && n < max_candidate)

  return [...new Set(indices)]
}

/**
 * Parse JSON response from LLM with confidence scores
 * @param {Object} params
 * @param {string} params.response - Raw LLM response (should be JSON)
 * @param {number} params.max_candidate - Maximum valid candidate number
 * @returns {Object} { indices: number[], confidence_map: Map<number, string>, reasoning: string }
 */
export function parse_json_response({ response, max_candidate }) {
  const empty_result = {
    indices: [],
    confidence_map: new Map(),
    reasoning: ''
  }

  if (!response || typeof response !== 'string') {
    return empty_result
  }

  const json_result = try_parse_json(response, max_candidate)
  if (json_result) {
    return json_result
  }

  // JSON parsing failed, fall back to number extraction
  log('Failed to parse JSON response, falling back to number extraction')
  return {
    ...empty_result,
    indices: extract_candidate_numbers(response, max_candidate)
  }
}

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

  const cleaned = response.trim()

  // Handle "none" or empty responses
  if (cleaned.toLowerCase() === 'none' || cleaned === '' || cleaned === '0') {
    return []
  }

  // Try JSON parsing first if it looks like JSON
  if (looks_like_json(cleaned)) {
    const json_result = try_parse_json(response, max_candidate)
    if (json_result && json_result.indices.length > 0) {
      return json_result.indices
    }
  }

  // Fall back to number extraction
  return extract_candidate_numbers(cleaned, max_candidate)
}

// ============================================================================
// Main Export
// ============================================================================

/**
 * Resolve model identifier (supports aliases for convenience)
 * @param {string} model - Model name or identifier
 * @returns {string} Full model identifier
 */
export function resolve_model(model) {
  if (!model) {
    return DEFAULT_MODEL
  }
  // Check if it's an alias in SUPPORTED_MODELS
  if (SUPPORTED_MODELS[model]) {
    return SUPPORTED_MODELS[model]
  }
  // Otherwise return as-is (could be a full model ID)
  return model
}

/**
 * Find threads related to the target thread using LLM classification
 * @param {Object} params
 * @param {Object} params.thread - Target thread metadata
 * @param {Array} params.recent_threads - Array of candidate thread metadata
 * @param {string} [params.model] - Model to use for classification
 * @param {boolean} [params.use_json_output=false] - Request structured JSON output
 * @param {boolean} [params.skip_prefilter=false] - Skip pre-filtering of candidates
 * @param {number} [params.max_candidates=30] - Maximum candidates after pre-filtering
 * @returns {Promise<Object>} { related_thread_ids, duration_ms, confidence_scores, reasoning }
 */
export async function find_related_threads({
  thread,
  recent_threads,
  model = DEFAULT_MODEL,
  use_json_output = false,
  skip_prefilter = false,
  max_candidates = PREFILTER.DEFAULT_MAX_CANDIDATES
}) {
  const empty_result = {
    related_thread_ids: [],
    duration_ms: 0,
    confidence_scores: {},
    reasoning: ''
  }

  if (!thread || !recent_threads || recent_threads.length === 0) {
    return empty_result
  }

  // Filter out the target thread from candidates
  let candidates = recent_threads.filter(
    (t) => t.thread_id !== thread.thread_id
  )

  if (candidates.length === 0) {
    return empty_result
  }

  // Apply pre-filtering unless skipped
  if (!skip_prefilter && candidates.length > max_candidates) {
    log(
      `Pre-filtering ${candidates.length} candidates to top ${max_candidates}`
    )
    candidates = prefilter_candidates({
      target_thread: thread,
      candidate_threads: candidates,
      max_candidates
    })
  }

  log(
    `Finding related threads for "${thread.title}" among ${candidates.length} candidates`
  )

  // Resolve model
  const resolved_model = resolve_model(model)
  log(`Using model: ${resolved_model}`)

  // Generate prompt
  const prompt = generate_relation_prompt({
    target_thread: thread,
    candidate_threads: candidates,
    use_json_output
  })

  try {
    // Call LLM with plan mode to reduce tool usage
    const { output, duration_ms } = await run_opencode({
      prompt,
      model: resolved_model,
      mode: 'plan'
    })

    // Extract and parse response
    const response = extract_model_response(output)
    log(`LLM response: ${response}`)

    let indices
    const confidence_scores = {}
    let reasoning = ''

    if (use_json_output) {
      const json_result = parse_json_response({
        response,
        max_candidate: candidates.length
      })
      indices = json_result.indices
      reasoning = json_result.reasoning

      // Convert confidence map to object with thread IDs
      for (const [idx, confidence] of json_result.confidence_map) {
        const thread_id = candidates[idx]?.thread_id
        if (thread_id) {
          confidence_scores[thread_id] = confidence
        }
      }
    } else {
      indices = parse_relation_response({
        response,
        max_candidate: candidates.length
      })
    }

    // Map indices back to thread IDs
    const related_thread_ids = indices.map((i) => candidates[i].thread_id)

    log(
      `Found ${related_thread_ids.length} related threads in ${duration_ms}ms`
    )

    return {
      related_thread_ids,
      duration_ms,
      confidence_scores,
      reasoning,
      candidates_evaluated: candidates.length,
      model_used: resolved_model
    }
  } catch (error) {
    log(`Error finding related threads: ${error.message}`)
    return {
      ...empty_result,
      error: error.message
    }
  }
}

export default find_related_threads
