/**
 * Find matching entity for Notion page
 */

import debug from 'debug'
import { Glob } from 'glob'
import { read_entity_from_filesystem } from '#libs-server/entity/filesystem/index.mjs'
import config from '#config'

const log = debug('integrations:notion:entity:find')

/**
 * Find entity by external ID
 * @param {string} external_id - The external ID to search for
 * @returns {Object|null} Found entity or null
 */
async function find_entity_by_external_id(external_id) {
  try {
    if (!config.user_base_directory) {
      throw new Error('User base directory not configured')
    }

    // Search through all markdown files in the user directory
    const glob = new Glob('**/*.md', {
      cwd: config.user_base_directory,
      absolute: true
    })

    for await (const file_path of glob) {
      try {
        const entity = await read_entity_from_filesystem(file_path)
        if (entity && entity.external_id === external_id) {
          log(`Found entity with external_id: ${external_id}`)
          return {
            ...entity,
            file_path: file_path.replace(config.user_base_directory + '/', '')
          }
        }
      } catch (error) {
        // Skip files that can't be parsed as entities
        continue
      }
    }

    return null
  } catch (error) {
    log(`Error searching for entity by external_id: ${error.message}`)
    return null
  }
}

/**
 * Find entity by fuzzy name matching
 * @param {string} name - Name to search for
 * @param {string} entity_type - Entity type to filter by
 * @returns {Object|null} Best matching entity or null
 */
async function find_entity_by_fuzzy_name(name, entity_type) {
  try {
    if (!config.user_base_directory) {
      throw new Error('User base directory not configured')
    }

    const candidates = []

    // Search in the appropriate entity type directory
    const type_dir = entity_type.replace('_', '-')
    const search_pattern = `${type_dir}/*.md`

    const glob = new Glob(search_pattern, {
      cwd: config.user_base_directory,
      absolute: true
    })

    for await (const file_path of glob) {
      try {
        const entity = await read_entity_from_filesystem(file_path)
        if (entity && entity.type === entity_type) {
          // Calculate similarity score
          const similarity = calculate_name_similarity(name, entity.name)
          if (similarity > 0.7) { // Threshold for considering a match
            candidates.push({
              entity,
              similarity,
              file_path: file_path.replace(config.user_base_directory + '/', '')
            })
          }
        }
      } catch (error) {
        // Skip files that can't be parsed
        continue
      }
    }

    // Return the best match
    if (candidates.length > 0) {
      candidates.sort((a, b) => b.similarity - a.similarity)
      const best_match = candidates[0]

      log(`Found fuzzy match for "${name}": "${best_match.entity.name}" (${best_match.similarity.toFixed(2)})`)
      return {
        ...best_match.entity,
        file_path: best_match.file_path,
        match_confidence: best_match.similarity
      }
    }

    return null
  } catch (error) {
    log(`Error in fuzzy name search: ${error.message}`)
    return null
  }
}

/**
 * Calculate similarity between two strings (simplified Levenshtein-based)
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} Similarity score between 0 and 1
 */
function calculate_name_similarity(str1, str2) {
  if (!str1 || !str2) return 0

  const s1 = str1.toLowerCase().trim()
  const s2 = str2.toLowerCase().trim()

  if (s1 === s2) return 1

  // Simple similarity based on common words and character overlap
  const words1 = s1.split(/\s+/)
  const words2 = s2.split(/\s+/)

  let common_words = 0
  for (const word1 of words1) {
    if (words2.some(word2 => word2.includes(word1) || word1.includes(word2))) {
      common_words++
    }
  }

  const word_similarity = common_words / Math.max(words1.length, words2.length)

  // Character-based similarity (simplified)
  const max_length = Math.max(s1.length, s2.length)
  let common_chars = 0

  const shorter = s1.length < s2.length ? s1 : s2
  const longer = s1.length >= s2.length ? s1 : s2

  for (let i = 0; i < shorter.length; i++) {
    if (longer.includes(shorter[i])) {
      common_chars++
    }
  }

  const char_similarity = common_chars / max_length

  // Combine word and character similarity
  return (word_similarity * 0.7) + (char_similarity * 0.3)
}

/**
 * Find entity for a Notion page using multiple strategies
 * @param {string} page_id - Notion page ID
 * @param {string} database_id - Database ID (null for standalone pages)
 * @param {Object} page_data - Notion page data for fuzzy matching
 * @returns {Object|null} Found entity or null
 */
export async function find_entity_for_notion_page(page_id, database_id = null, page_data = null) {
  try {
    log(`Searching for entity matching Notion page: ${page_id}`)

    // Strategy 1: Search by external ID
    const external_id = database_id
      ? `notion:database:${database_id}:${page_id}`
      : `notion:page:${page_id}`

    let entity = await find_entity_by_external_id(external_id)
    if (entity) {
      log(`Found entity by external_id: ${entity.entity_id}`)
      return {
        ...entity,
        match_method: 'external_id',
        match_confidence: 1.0
      }
    }

    // Strategy 2: Fuzzy matching by name if page data is provided
    if (page_data && page_data.properties) {
      // Extract name/title from page properties
      let page_name = null

      // Look for title property
      for (const [, prop_data] of Object.entries(page_data.properties)) {
        if (prop_data.type === 'title' && prop_data.title && prop_data.title.length > 0) {
          page_name = prop_data.title.map(item => item.plain_text || '').join('')
          break
        }
      }

      // Look for name-like properties if no title found
      if (!page_name) {
        for (const [prop_name, prop_data] of Object.entries(page_data.properties)) {
          if (prop_name.toLowerCase().includes('name') && prop_data.rich_text) {
            page_name = prop_data.rich_text.map(item => item.plain_text || '').join('')
            break
          }
        }
      }

      if (page_name && page_name.trim()) {
        // Determine entity type for fuzzy search
        let entity_type = 'text' // Default for standalone pages
        if (database_id) {
          const { get_entity_type_for_database } = await import('../notion-entity-mapper.mjs')
          entity_type = get_entity_type_for_database(database_id) || 'physical_item'
        }

        entity = await find_entity_by_fuzzy_name(page_name.trim(), entity_type)
        if (entity) {
          log(`Found entity by fuzzy name matching: ${entity.entity_id}`)
          return {
            ...entity,
            match_method: 'fuzzy_name',
            match_confidence: entity.match_confidence
          }
        }
      }
    }

    log(`No matching entity found for Notion page: ${page_id}`)
    return null
  } catch (error) {
    log(`Error finding entity for Notion page: ${error.message}`)
    return null
  }
}
