import debug from 'debug'

import search_entities from '#libs-server/entity/search/search-entities.mjs'
import RipgrepSearch from '#libs-server/entity/search/ripgrep-search.mjs'

const log = debug('file-search-engine')

/**
 * Unified file-based search engine that combines existing utilities
 * with optional ripgrep performance enhancements
 */
class FileSearchEngine {
  constructor() {
    this.ripgrep_search = new RipgrepSearch()
    this.ripgrep_available = null
  }

  async _check_ripgrep_availability() {
    if (this.ripgrep_available === null) {
      this.ripgrep_available = await RipgrepSearch.check_availability()
      log(`Ripgrep availability: ${this.ripgrep_available}`)
    }
    return this.ripgrep_available
  }

  /**
   * Search entities using existing file-based entity search
   * This reuses all existing utilities and patterns
   */
  async search_entities(params) {
    return search_entities(params)
  }

  /**
   * Fast content search using ripgrep when available,
   * fallback to existing search utilities
   */
  async search_content(pattern, options = {}) {
    const ripgrep_available = await this._check_ripgrep_availability()

    if (ripgrep_available) {
      try {
        return await this.ripgrep_search.search_content(pattern, options)
      } catch (error) {
        log(
          'Ripgrep search failed, falling back to entity search:',
          error.message
        )
      }
    }

    // Fallback to existing entity search with search term
    const { user_id, entity_types = null, limit = 100, offset = 0 } = options

    if (!user_id) {
      throw new Error('user_id required for content search fallback')
    }

    return search_entities({
      user_id,
      search_term: pattern,
      entity_types,
      limit,
      offset
    })
  }

  /**
   * Get match count using ripgrep when available
   */
  async get_content_match_count(pattern, options = {}) {
    const ripgrep_available = await this._check_ripgrep_availability()

    if (ripgrep_available) {
      try {
        return await this.ripgrep_search.get_file_matches_count(
          pattern,
          options
        )
      } catch (error) {
        log('Ripgrep count failed:', error.message)
        return 0
      }
    }

    // Fallback: estimate based on search results
    const { user_id } = options
    if (!user_id) {
      return 0
    }

    const results = await this.search_entities({
      user_id,
      search_term: pattern,
      limit: 1000 // Large limit for counting
    })

    return results.length
  }

  /**
   * Check if advanced search features are available
   */
  async get_capabilities() {
    const ripgrep_available = await this._check_ripgrep_availability()

    return {
      ripgrep_available,
      supports_regex: ripgrep_available,
      supports_fast_content_search: ripgrep_available,
      supports_line_numbers: ripgrep_available,
      supports_context_lines: ripgrep_available
    }
  }
}

// Create singleton instance
const file_search_engine = new FileSearchEngine()

export default file_search_engine
export { FileSearchEngine }
