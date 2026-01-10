import { spawn } from 'child_process'
import debug from 'debug'

import { load_search_config } from './search-config.mjs'

const log = debug('search:fzf')

/**
 * Execute fzf command for ranking results
 *
 * @param {Object} params - Parameters
 * @param {string} params.input - Input to pipe to fzf
 * @param {string[]} params.args - Fzf arguments
 * @param {number} params.timeout_ms - Timeout in milliseconds
 * @returns {Promise<string>} Fzf output
 */
async function execute_fzf({ input, args, timeout_ms = 10000 }) {
  return new Promise((resolve, reject) => {
    log(`Executing: fzf ${args.join(' ')}`)

    const fzf_process = spawn('fzf', args, {
      stdio: ['pipe', 'pipe', 'pipe']
    })

    let stdout = ''
    let stderr = ''

    const timer = setTimeout(() => {
      fzf_process.kill('SIGTERM')
      reject(new Error('Fzf ranking timed out'))
    }, timeout_ms)

    fzf_process.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    fzf_process.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    fzf_process.on('close', (code) => {
      clearTimeout(timer)
      // fzf exits with code 1 when no matches, code 130 on interrupt
      if (code === 0 || code === 1) {
        resolve(stdout)
      } else {
        reject(new Error(`Fzf failed with code ${code}: ${stderr}`))
      }
    })

    fzf_process.on('error', (error) => {
      clearTimeout(timer)
      reject(new Error(`Failed to execute fzf: ${error.message}`))
    })

    // Write input and close stdin
    fzf_process.stdin.write(input)
    fzf_process.stdin.end()
  })
}

/**
 * Build fzf arguments from configuration
 *
 * @param {Object} params - Parameters
 * @param {string} params.query - Search query for filtering
 * @param {Object} params.fzf_config - Fzf configuration
 * @param {number} params.limit - Maximum results
 * @returns {string[]} Fzf arguments
 */
function build_fzf_args({ query, fzf_config, limit }) {
  const args = ['--filter', query]

  // Algorithm
  if (fzf_config.algorithm) {
    args.push(`--algo=${fzf_config.algorithm}`)
  }

  // Case mode
  if (fzf_config.case_mode === 'smart-case') {
    args.push('--smart-case')
  } else if (fzf_config.case_mode === 'ignore-case') {
    args.push('-i')
  } else if (fzf_config.case_mode === 'case-sensitive') {
    args.push('+i')
  }

  // Tiebreak
  if (fzf_config.tiebreak && fzf_config.tiebreak.length > 0) {
    args.push(`--tiebreak=${fzf_config.tiebreak.join(',')}`)
  }

  // Sort
  if (fzf_config.sort === false) {
    args.push('--no-sort')
  }

  return args
}

/**
 * Rank search results using fzf fuzzy matching
 *
 * @param {Object} params - Parameters
 * @param {string} params.query - Search query
 * @param {Array<Object>} params.results - Results to rank
 * @param {string} [params.rank_field='file_path'] - Field to use for ranking
 * @param {number} [params.limit=50] - Maximum results to return
 * @returns {Promise<Array<Object>>} Ranked results
 */
export async function rank_results({
  query,
  results,
  rank_field = 'file_path',
  limit = 50
}) {
  if (!query || !query.trim() || !results || results.length === 0) {
    return results?.slice(0, limit) || []
  }

  const search_config = await load_search_config()
  const fzf_config = search_config.fzf || {}

  // Create a map of rank values to original results
  const result_map = new Map()
  const input_lines = []

  for (let i = 0; i < results.length; i++) {
    const result = results[i]
    const rank_value = result[rank_field] || ''
    // Use index as unique key in case of duplicate paths
    const key = `${i}:${rank_value}`
    result_map.set(key, result)
    input_lines.push(key)
  }

  const input = input_lines.join('\n')

  try {
    const args = build_fzf_args({ query, fzf_config, limit })

    const output = await execute_fzf({
      input,
      args,
      timeout_ms: 10000
    })

    if (!output.trim()) {
      return []
    }

    const ranked_keys = output.trim().split('\n')
    const ranked_results = []

    for (const key of ranked_keys) {
      if (ranked_results.length >= limit) break

      const result = result_map.get(key)
      if (result) {
        ranked_results.push(result)
      }
    }

    log(`Ranked ${results.length} results to ${ranked_results.length}`)
    return ranked_results
  } catch (error) {
    log(`Fzf ranking failed: ${error.message}, returning unranked results`)
    // Fall back to simple substring matching
    return simple_rank_results({ query, results, rank_field, limit })
  }
}

/**
 * Simple fallback ranking when fzf is unavailable
 *
 * @param {Object} params - Parameters
 * @param {string} params.query - Search query
 * @param {Array<Object>} params.results - Results to rank
 * @param {string} [params.rank_field='file_path'] - Field to use for ranking
 * @param {number} [params.limit=50] - Maximum results to return
 * @returns {Array<Object>} Ranked results
 */
export function simple_rank_results({
  query,
  results,
  rank_field = 'file_path',
  limit = 50
}) {
  if (!query || !results) {
    return results?.slice(0, limit) || []
  }

  const query_lower = query.toLowerCase()

  // Score and sort results
  const scored_results = results.map((result) => {
    const value = (result[rank_field] || '').toLowerCase()
    let score = 0

    // Exact match gets highest score
    if (value === query_lower) {
      score = 1000
    }
    // Starts with query
    else if (value.startsWith(query_lower)) {
      score = 500
    }
    // Contains query
    else if (value.includes(query_lower)) {
      score = 100
    }
    // Fuzzy match - count matching characters
    else {
      let query_index = 0
      for (const char of value) {
        if (
          query_index < query_lower.length &&
          char === query_lower[query_index]
        ) {
          query_index++
          score += 1
        }
      }
    }

    // Prefer shorter paths
    score -= value.length * 0.01

    return { result, score }
  })

  // Sort by score descending
  scored_results.sort((a, b) => b.score - a.score)

  return scored_results.slice(0, limit).map(({ result }) => result)
}

/**
 * Check if fzf is available on the system
 *
 * @returns {Promise<boolean>} True if fzf is available
 */
export async function check_fzf_availability() {
  try {
    const fzf_process = spawn('fzf', ['--version'])
    return new Promise((resolve) => {
      fzf_process.on('close', (code) => {
        resolve(code === 0)
      })
      fzf_process.on('error', () => {
        resolve(false)
      })
    })
  } catch (error) {
    return false
  }
}

export default {
  rank_results,
  simple_rank_results,
  check_fzf_availability
}
