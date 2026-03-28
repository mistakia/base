import debug from 'debug'
import { list_entity_files_from_filesystem } from '#libs-server/repository/filesystem/list-entity-files-from-filesystem.mjs'

const log = debug('physical-items:filesystem:list')

/**
 * List physical items from the filesystem
 *
 * Recursively scans the user-base physical-item/ directory for .md files,
 * parses YAML frontmatter, and returns normalized physical item objects
 * with a derived `category` field from the relative file path.
 *
 * @returns {Promise<Array>} - List of physical item entity objects
 */
export async function list_physical_items_from_filesystem() {
  try {
    log('Listing physical items from filesystem')

    const entity_files = await list_entity_files_from_filesystem({
      include_entity_types: ['physical_item'],
      include_path_patterns: ['physical-item/**/*.md']
    })

    const items = []

    for (const entity_file of entity_files) {
      try {
        const { entity_properties, file_info } = entity_file

        // Derive category from relative path within physical-item/ directory
        const base_uri = entity_properties.base_uri || file_info?.base_uri || ''
        const category = derive_category_from_base_uri(base_uri)

        items.push({
          ...entity_file,
          entity_properties: {
            ...entity_properties,
            category
          }
        })
      } catch (error) {
        log('Error processing physical item entity:', error.message)
      }
    }

    log(`Found ${items.length} physical items`)
    return items
  } catch (error) {
    log('Error listing physical items from filesystem:', error.message)
    throw error
  }
}

/**
 * Derive category from base_uri by extracting the directory portion
 * within physical-item/
 *
 * e.g. "user:physical-item/home/homelab/rack.md" -> "home/homelab"
 * e.g. "user:physical-item/vehicle/tool.md" -> "vehicle"
 */
function derive_category_from_base_uri(base_uri) {
  // Remove scheme prefix (e.g. "user:")
  const path = base_uri.replace(/^[^:]+:/, '')

  // Remove the "physical-item/" prefix
  const relative = path.replace(/^physical-item\//, '')

  // Extract directory portion (everything before the filename)
  const last_slash = relative.lastIndexOf('/')
  if (last_slash === -1) return ''

  return relative.substring(0, last_slash)
}

export default { list_physical_items_from_filesystem }
