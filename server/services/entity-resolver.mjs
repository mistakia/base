import debug from 'debug'
import { read_entity_from_filesystem } from '#libs-server/entity/filesystem/read-entity-from-filesystem.mjs'
import { resolve_base_uri } from '#libs-server/base-uri/base-uri-utilities.mjs'
import { check_user_permission } from '#server/middleware/permission-checker.mjs'

const log = debug('server:entity-resolver')

/**
 * Extract metadata from entity markdown file using existing entity system
 *
 * @param {Object} params - Parameters object
 * @param {string} params.file_path - Relative file path to entity (e.g., 'task/base/my-task.md')
 * @param {string} [params.user_public_key] - User public key for permission checking
 * @returns {Promise<Object>} Entity metadata object
 */
export async function resolve_entity_from_path({ file_path, user_public_key }) {
  try {
    log(`Resolving entity from path: ${file_path}`)

    // Convert relative path to absolute using base-uri system
    const base_uri = `user:${file_path}`
    const absolute_path = resolve_base_uri(base_uri)

    // Use established entity reading function
    const result = await read_entity_from_filesystem({ absolute_path })

    if (!result.success) {
      log(`Entity file not found or invalid: ${file_path}`)
      return {
        exists: false,
        file_path,
        error: result.error || 'Entity not found'
      }
    }

    // Check permissions using established middleware
    const permission_result = await check_user_permission({
      user_public_key,
      resource_path: base_uri
    })
    const is_public = permission_result.allowed
    const is_redacted =
      !is_public && user_public_key !== result.entity_properties.user_public_key

    // Extract description from entity properties or content
    let description =
      result.entity_properties.description ||
      result.entity_properties.short_description
    if (!description && result.entity_content) {
      // Get first non-empty paragraph from markdown content
      const lines = result.entity_content.split('\n')
      for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('```')) {
          description = trimmed.substring(0, 160)
          if (trimmed.length > 160) description += '...'
          break
        }
      }
    }

    // Return structured metadata using existing properties
    const entity_metadata = {
      exists: true,
      file_path,
      entity_id: result.entity_properties.entity_id,
      type: result.entity_properties.type || extract_type_from_path(file_path),
      title:
        result.entity_properties.title ||
        result.entity_properties.name ||
        extract_title_from_path(file_path),
      description: description || 'No description available',
      created_at: result.entity_properties.created_at,
      updated_at: result.entity_properties.updated_at,
      tags:
        result.formatted_entity_metadata?.property_tags ||
        result.entity_properties.tags ||
        [],
      public_read: is_public,
      is_redacted,
      user_public_key: result.entity_properties.user_public_key,
      priority: result.entity_properties.priority,
      status: result.entity_properties.status,
      relations:
        result.formatted_entity_metadata?.relations ||
        result.entity_properties.relations ||
        []
    }

    log(`Successfully resolved entity: ${file_path}`)
    return entity_metadata
  } catch (error) {
    log(`Error resolving entity from path ${file_path}: ${error.message}`)
    return {
      exists: false,
      file_path,
      error: error.message
    }
  }
}

/**
 * Extract entity type from file path
 *
 * @param {string} file_path - File path like 'task/base/my-task.md'
 * @returns {string} Entity type or 'unknown'
 */
function extract_type_from_path(file_path) {
  const parts = file_path.split('/')
  if (parts.length > 0) {
    // First directory is typically the entity type
    return parts[0]
  }
  return 'unknown'
}

/**
 * Extract title from file path
 *
 * @param {string} file_path - File path like 'task/base/my-task.md'
 * @returns {string} Human-readable title
 */
function extract_title_from_path(file_path) {
  const filename = file_path.split('/').pop().replace('.md', '')
  // Convert kebab-case to title case
  return filename
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export default resolve_entity_from_path
