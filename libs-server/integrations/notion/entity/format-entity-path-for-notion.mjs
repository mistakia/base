/**
 * Format entity file path for Notion-synced entities
 */

import debug from 'debug'
import { sanitize_for_filename } from '#libs-server/utils/sanitize-filename.mjs'
import { get_directory_for_entity_type } from '#libs-server/entity/filesystem/get-directory-for-entity-type.mjs'

const log = debug('integrations:notion:entity:format-path')

/**
 * Format entity file path for Notion-synced entities
 * @param {Object} entity - Entity object
 * @returns {string} File path for the entity
 */
export function format_entity_path_for_notion(entity) {
  try {
    // Get directory based on entity type
    const directory = get_directory_for_entity_type(entity.type)

    // Sanitize entity name for filename
    const filename = sanitize_for_filename(entity.name)

    // Construct file path
    const file_path = `${directory}/${filename}.md`

    log(`Formatted entity path: ${entity.type} "${entity.name}" → ${file_path}`)
    return file_path
  } catch (error) {
    log(`Error formatting entity path: ${error.message}`)

    // Fallback to a safe default path
    const directory = get_directory_for_entity_type(entity.type || 'text')
    const fallback_name = entity.entity_id
      ? `entity-${entity.entity_id.substring(0, 8)}`
      : `entity-${Date.now()}`

    return `${directory}/${fallback_name}.md`
  }
}
