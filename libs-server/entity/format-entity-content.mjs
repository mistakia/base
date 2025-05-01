import debug from 'debug'

const log = debug('entity')

/**
 * Formats entity data into a markdown string with frontmatter
 *
 * @param {Object} options - Function options
 * @param {Object} options.frontmatter - The frontmatter data to include
 * @param {string} [options.content=''] - The markdown content
 * @returns {string} - The formatted markdown content with frontmatter
 */
export function format_entity_file_content({ frontmatter, content = '' }) {
  try {
    // Ensure frontmatter is valid
    if (!frontmatter || typeof frontmatter !== 'object') {
      throw new Error('Frontmatter must be a valid object')
    }

    // Create frontmatter block
    const yaml_lines = ['---']

    // Sort keys for consistent output, with 'title', 'type', priority fields first
    const priority_fields = ['title', 'type', 'status', 'description']
    const sorted_keys = Object.keys(frontmatter).sort((a, b) => {
      const a_priority = priority_fields.indexOf(a)
      const b_priority = priority_fields.indexOf(b)

      if (a_priority !== -1 && b_priority !== -1) return a_priority - b_priority
      if (a_priority !== -1) return -1
      if (b_priority !== -1) return 1
      return a.localeCompare(b)
    })

    for (const key of sorted_keys) {
      const value = frontmatter[key]

      // Skip null or undefined values
      if (value === null || value === undefined) {
        continue
      } else if (Array.isArray(value)) {
        yaml_lines.push(`${key}:`)
        value.forEach((item) => {
          yaml_lines.push(
            `  - ${typeof item === 'string' ? JSON.stringify(item) : JSON.stringify(item)}`
          )
        })
      } else if (typeof value === 'object') {
        // Simple one-level object serialization
        yaml_lines.push(`${key}:`)
        Object.entries(value).forEach(([k, v]) => {
          yaml_lines.push(
            `  ${k}: ${typeof v === 'string' ? JSON.stringify(v) : JSON.stringify(v)}`
          )
        })
      } else if (typeof value === 'string') {
        // For key status values, don't add quotes
        if (key === 'status') {
          yaml_lines.push(`${key}: ${value}`)
        } else {
          // For other strings, ensure proper quoting
          yaml_lines.push(`${key}: ${JSON.stringify(value)}`)
        }
      } else {
        // For non-strings like numbers, booleans
        yaml_lines.push(`${key}: ${value}`)
      }
    }

    yaml_lines.push('---')

    // Combine frontmatter and content
    return `${yaml_lines.join('\n')}\n\n${content.trim()}`
  } catch (error) {
    log('Error formatting entity content:', error)
    throw error
  }
}

/**
 * Maps of base fields that are required according to the base schema
 */
const BASE_REQUIRED_FIELDS = ['title', 'type', 'description', 'user_id']

/**
 * Maps of base fields that are optional according to the base schema
 */
const BASE_OPTIONAL_FIELDS = [
  'permalink',
  'tags',
  'relations',
  'observations',
  'archived_at'
]

/**
 * Maps of base fields that are auto-generated according to the base schema
 */
const BASE_AUTO_GENERATED_FIELDS = ['created_at', 'updated_at']

/**
 * Prepares base entity frontmatter fields based on the base schema
 *
 * @param {Object} options - Function options
 * @param {Object} options.entity_data - The entity data to prepare
 * @param {string} options.entity_type - The entity type
 * @returns {Object} - The prepared frontmatter object
 */
export function format_entity_frontmatter({ entity_data, entity_type }) {
  const now = new Date().toISOString()

  // Initialize frontmatter object
  const frontmatter = {}

  // Validate required base fields
  if (!entity_data.title) {
    throw new Error('Entity title is required')
  }

  if (!entity_data.description) {
    throw new Error('Entity description is required')
  }

  if (!entity_data.user_id) {
    throw new Error('Entity user_id is required')
  }

  // Add required fields
  frontmatter.type = entity_type
  frontmatter.title = entity_data.title
  frontmatter.description = entity_data.description
  frontmatter.user_id = entity_data.user_id

  // Add auto-generated timestamp fields
  frontmatter.created_at = entity_data.created_at || now
  frontmatter.updated_at = now

  // Add optional base fields if present
  if (entity_data.permalink !== undefined) {
    frontmatter.permalink = entity_data.permalink
  }

  if (entity_data.tags && Array.isArray(entity_data.tags)) {
    frontmatter.tags = entity_data.tags
  }

  if (entity_data.relations && Array.isArray(entity_data.relations)) {
    frontmatter.relations = entity_data.relations
  }

  if (entity_data.observations && Array.isArray(entity_data.observations)) {
    frontmatter.observations = entity_data.observations
  }

  if (entity_data.archived_at !== undefined) {
    frontmatter.archived_at = entity_data.archived_at
  }

  // Add all other custom fields from the entity_data
  // This allows the function to support extended types like task.md
  Object.entries(entity_data).forEach(([key, value]) => {
    // Skip fields we've already processed
    const all_base_fields = [
      ...BASE_REQUIRED_FIELDS,
      ...BASE_OPTIONAL_FIELDS,
      ...BASE_AUTO_GENERATED_FIELDS
    ]

    if (
      !all_base_fields.includes(key) &&
      value !== undefined &&
      value !== null
    ) {
      frontmatter[key] = value
    }
  })

  return frontmatter
}
