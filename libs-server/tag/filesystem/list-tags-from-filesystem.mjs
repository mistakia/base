import debug from 'debug'
import { list_entity_files_from_filesystem } from '#libs-server/repository/filesystem/list-entity-files-from-filesystem.mjs'

const log = debug('tag:filesystem:list')

/**
 * List tags from the filesystem by scanning tag entities
 * This replaces the database-based tag listing with file-based operations
 *
 * @param {Object} params Parameters
 * @param {string} params.user_public_key User public key
 * @param {boolean} [params.include_archived=false] Whether to include archived tags
 * @param {string} [params.search_term] Search term to filter tags by title
 * @returns {Promise<Array>} Array of tag objects
 */
export async function list_tags_from_filesystem({
  user_public_key,
  include_archived = false,
  search_term
} = {}) {
  try {
    log(`Listing tags from filesystem for user ${user_public_key}`)

    if (!user_public_key) {
      throw new Error('user_public_key is required')
    }

    // Use the proper entity listing function that handles entity validation and type filtering
    const tag_entities = await list_entity_files_from_filesystem({
      include_entity_types: ['tag'],
      include_path_patterns: ['tag/**/*.md'] // Focus on tag directory
    })

    const matching_tags = []

    for (const entity_file of tag_entities) {
      try {
        const { entity_properties } = entity_file

        // Skip if not belonging to the user
        if (entity_properties.user_public_key !== user_public_key) {
          continue
        }

        // Apply archived filter
        if (!include_archived && entity_properties.archived === true) {
          continue
        }
        if (include_archived && entity_properties.archived !== true) {
          continue
        }

        // Apply search term filter
        if (
          search_term &&
          entity_properties.title &&
          !entity_properties.title
            .toLowerCase()
            .includes(search_term.toLowerCase())
        ) {
          continue
        }

        // Build the tag object
        const tag = {
          tag_entity_id: entity_properties.entity_id,
          title: entity_properties.title,
          description: entity_properties.description,
          user_public_key: entity_properties.user_public_key,
          created_at: entity_properties.created_at,
          updated_at: entity_properties.updated_at,
          // Tag-specific properties from frontmatter
          color: entity_properties.color
        }

        matching_tags.push(tag)
      } catch (error) {
        log('Error processing tag entity:', error.message)
      }
    }

    // Sort by title ascending (same as database version)
    matching_tags.sort((a, b) => {
      if (a.title && b.title) {
        return a.title.localeCompare(b.title)
      }
      return 0
    })

    log(`Found ${matching_tags.length} matching tags`)
    return matching_tags
  } catch (error) {
    log('Error listing tags from filesystem:', error)
    throw error
  }
}

export default {
  list_tags_from_filesystem
}
