import debug from 'debug'

const log = debug('search:fuzzy')

// Scoring constants
const CONSECUTIVE_BONUS = 5
const WORD_BOUNDARY_START_BONUS = 8
const WORD_BOUNDARY_SEPARATOR_BONUS = 5
const WORD_BOUNDARY_OTHER_BONUS = 4
const CAMEL_CASE_BONUS = 2
const CASE_MATCH_BONUS = 1
const PATH_LENGTH_PENALTY = 0.01

/**
 * Check if a character is a word boundary separator
 *
 * @param {string} char - Character to check
 * @returns {boolean} True if character is a separator
 */
function is_separator(char) {
  return (
    char === '/' || char === '_' || char === '-' || char === '.' || char === ' '
  )
}

/**
 * Check if position is at a word boundary in the target string
 *
 * @param {string} target - Target string
 * @param {number} position - Position to check
 * @returns {Object} Boundary info with type and bonus
 */
function get_word_boundary_bonus({ target, position }) {
  if (position === 0) {
    return { is_boundary: true, bonus: WORD_BOUNDARY_START_BONUS }
  }

  const prev_char = target[position - 1]
  const curr_char = target[position]

  // After path separator
  if (prev_char === '/') {
    return { is_boundary: true, bonus: WORD_BOUNDARY_SEPARATOR_BONUS }
  }

  // After other separators
  if (is_separator(prev_char)) {
    return { is_boundary: true, bonus: WORD_BOUNDARY_OTHER_BONUS }
  }

  // CamelCase boundary (lowercase followed by uppercase)
  if (
    prev_char &&
    prev_char === prev_char.toLowerCase() &&
    prev_char !== prev_char.toUpperCase() &&
    curr_char === curr_char.toUpperCase() &&
    curr_char !== curr_char.toLowerCase()
  ) {
    return { is_boundary: true, bonus: CAMEL_CASE_BONUS }
  }

  return { is_boundary: false, bonus: 0 }
}

/**
 * Score a single word against a target string
 *
 * @param {Object} params - Parameters
 * @param {string} params.word - Query word to match
 * @param {string} params.target - Target string to match against
 * @returns {number} Score for this word match (0 if no match)
 */
function score_word({ word, target }) {
  if (!word || !target) {
    return 0
  }

  const word_lower = word.toLowerCase()
  const target_lower = target.toLowerCase()

  let word_index = 0
  let score = 0
  let prev_match_index = -1
  let consecutive_count = 0

  for (
    let target_index = 0;
    target_index < target.length && word_index < word_lower.length;
    target_index++
  ) {
    const target_char = target_lower[target_index]
    const word_char = word_lower[word_index]

    if (target_char === word_char) {
      // Base score for match
      score += 1

      // Case match bonus
      if (target[target_index] === word[word_index]) {
        score += CASE_MATCH_BONUS
      }

      // Consecutive match bonus
      if (prev_match_index === target_index - 1) {
        consecutive_count++
        score += CONSECUTIVE_BONUS * consecutive_count
      } else {
        consecutive_count = 0
      }

      // Word boundary bonus
      const boundary = get_word_boundary_bonus({
        target,
        position: target_index
      })
      if (boundary.is_boundary) {
        score += boundary.bonus
      }

      prev_match_index = target_index
      word_index++
    }
  }

  // Return 0 if not all characters matched
  if (word_index < word_lower.length) {
    return 0
  }

  return score
}

/**
 * Score a query against a target path using fuzzy matching
 *
 * @param {Object} params - Parameters
 * @param {string} params.query - Search query (may contain multiple words)
 * @param {string} params.target - Target path to match against
 * @returns {number} Match score (0 if no match, higher is better)
 */
export function score_match({ query, target }) {
  if (!query || !target) {
    return 0
  }

  const trimmed_query = query.trim()
  if (!trimmed_query) {
    return 0
  }

  // Split query into words
  const words = trimmed_query.split(/\s+/)

  let total_score = 0

  // Each word must match independently
  for (const word of words) {
    const word_score = score_word({ word, target })

    // If any word doesn't match, the whole query fails
    if (word_score === 0) {
      return 0
    }

    total_score += word_score
  }

  // Apply path length penalty (prefer shorter paths)
  total_score -= target.length * PATH_LENGTH_PENALTY

  return total_score
}

/**
 * Score and rank search results using fuzzy matching
 *
 * @param {Object} params - Parameters
 * @param {string} params.query - Search query
 * @param {Array<Object>} params.results - Results to rank
 * @param {string} [params.rank_field='file_path'] - Field to use for ranking
 * @param {number} [params.limit=50] - Maximum results to return
 * @returns {Array<Object>} Ranked results with scores
 */
export function score_and_rank_results({
  query,
  results,
  rank_field = 'file_path',
  limit = 50
}) {
  if (!query || !query.trim()) {
    return []
  }

  if (!results || results.length === 0) {
    return []
  }

  log(`Scoring ${results.length} results for query: ${query}`)

  // Score all results
  const scored_results = []

  for (const result of results) {
    const target = result[rank_field] || ''
    const score = score_match({ query, target })

    // Only include results that match all words
    if (score > 0) {
      scored_results.push({
        ...result,
        score
      })
    }
  }

  // Sort by score descending
  scored_results.sort((a, b) => b.score - a.score)

  // Apply limit
  const limited_results = scored_results.slice(0, limit)

  log(`Ranked ${results.length} results to ${limited_results.length} matches`)

  return limited_results
}
