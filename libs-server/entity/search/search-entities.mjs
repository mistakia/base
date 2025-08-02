import { list_markdown_files_in_filesystem } from '#libs-server/repository/filesystem/list-markdown-files-in-filesystem.mjs'
import { format_entity_from_file_content } from '#libs-server/entity/format/format-entity-from-file-content.mjs'
import { read_file_from_filesystem } from '#libs-server/filesystem/read-file-from-filesystem.mjs'
import config from '#config'

/**
 * Search for entities using file-based approach
 *
 * @param {Object} params - Parameters for searching entities
 * @param {string} params.user_id - The user ID who owns the entities
 * @param {string[]} [params.tag_base_uris] - Optional array of tag base_uris to filter by
 * @param {boolean} [params.include_archived=false] - Whether to include archived entities
 * @param {string[]} [params.entity_types] - Optional array of entity types to filter by
 * @param {string} [params.search_term] - Optional search term to filter by title
 * @param {number} [params.limit=100] - Maximum number of entities to return
 * @param {number} [params.offset=0] - Offset for pagination
 * @returns {Promise<Array>} - Array of matching entities
 */
export default async function search_entities({
  user_id,
  tag_base_uris = null,
  include_archived = false,
  entity_types = null,
  search_term = null,
  limit = 100,
  offset = 0
}) {
  // Validate required parameters
  if (!user_id) {
    throw new Error('user_id is required for entity search')
  }

  // Get user base directory
  const user_base_dir =
    config.user_base_directory || process.env.USER_BASE_DIRECTORY
  if (!user_base_dir) {
    throw new Error('USER_BASE_DIRECTORY not configured')
  }

  // Get all markdown files from user base directory
  const file_list = await list_markdown_files_in_filesystem({
    repository_path: user_base_dir,
    exclude_dirs: ['.git', '.system', 'node_modules']
  })

  const entities = []

  // Process each file to extract entity data
  for (const file_info of file_list) {
    try {
      const file_content = await read_file_from_filesystem(file_info.file_path)
      const entity_data = format_entity_from_file_content({
        file_content,
        file_path: file_info.file_path
      })

      // Skip if not a valid entity or doesn't belong to user
      if (!entity_data || entity_data.user_id !== user_id) {
        continue
      }

      // Apply filters

      // Filter by archived status
      const is_archived = !!entity_data.archived_at
      if (!include_archived && is_archived) {
        continue
      }
      if (include_archived && !is_archived) {
        continue
      }

      // Filter by entity types
      if (entity_types && entity_types.length > 0) {
        if (!entity_types.includes(entity_data.type)) {
          continue
        }
      }

      // Filter by search term in title
      if (search_term && search_term.trim()) {
        const term = search_term.trim().toLowerCase()
        const title = (entity_data.title || '').toLowerCase()
        if (!title.includes(term)) {
          continue
        }
      }

      // Filter by tags if specified
      if (tag_base_uris && tag_base_uris.length > 0) {
        const entity_relations = entity_data.relations || []
        const entity_tags = entity_relations.filter(
          (rel) =>
            rel.relation_type === 'has_tag' &&
            tag_base_uris.includes(rel.target_base_uri)
        )

        // Check if entity has all required tags (AND logic)
        if (entity_tags.length !== tag_base_uris.length) {
          continue
        }
      }

      entities.push(entity_data)
    } catch (error) {
      // Skip files that can't be processed
      continue
    }
  }

  // Sort by updated_at descending
  entities.sort((a, b) => {
    const date_a = new Date(a.updated_at || a.created_at || 0)
    const date_b = new Date(b.updated_at || b.created_at || 0)
    return date_b.getTime() - date_a.getTime()
  })

  // Apply pagination
  const paginated_entities = entities.slice(offset, offset + limit)

  return paginated_entities
}
