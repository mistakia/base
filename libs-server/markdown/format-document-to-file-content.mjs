import debug from 'debug'
import yaml from 'js-yaml'

const log = debug('markdown:format-document-to-file-content')

/**
 * Format document properties and content into a markdown file with frontmatter
 *
 * @param {Object} options - Function options
 * @param {Object} options.document_properties - The document properties to include in frontmatter
 * @param {string} [options.document_content=''] - The markdown content to include after the frontmatter
 * @returns {string} - The formatted markdown file content
 */
export function format_document_to_file_content({
  document_properties,
  document_content = ''
}) {
  try {
    if (!document_properties || typeof document_properties !== 'object') {
      throw new Error('Document properties must be a valid object')
    }

    // Prepare properties with priority fields first
    const priority_fields = ['title', 'type', 'status', 'description']
    const sorted_properties = {}

    // First add priority fields in order
    for (const field of priority_fields) {
      if (
        document_properties[field] !== undefined &&
        document_properties[field] !== null
      ) {
        sorted_properties[field] = document_properties[field]
      }
    }

    // Then add all other fields alphabetically
    const remaining_keys = Object.keys(document_properties)
      .filter((key) => !priority_fields.includes(key))
      .sort()

    for (const key of remaining_keys) {
      const value = document_properties[key]
      if (value !== undefined && value !== null) {
        sorted_properties[key] = value
      }
    }

    // Special handling for description field - ensure it uses block scalar
    if (sorted_properties.description) {
      // We'll handle the block formatting during YAML serialization
      sorted_properties.description = sorted_properties.description.trim()
    }

    // Special handling for status - ensure it's not quoted
    if (sorted_properties.status) {
      // js-yaml will handle this correctly as long as it's a string
      sorted_properties.status = String(sorted_properties.status)
    }

    // Generate YAML with js-yaml
    const yaml_options = {
      lineWidth: 100,
      noRefs: true,
      noCompatMode: true
    }

    // Convert to YAML
    const yaml_content = yaml.dump(sorted_properties, yaml_options)

    // Combine frontmatter and content
    return `---\n${yaml_content}---\n\n${document_content.trim()}\n`
  } catch (error) {
    log('Error formatting document content:', error)
    throw error
  }
}
