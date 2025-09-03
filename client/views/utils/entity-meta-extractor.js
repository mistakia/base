/**
 * Client-side entity metadata extraction utility
 * Extracts meta tag data from entity frontmatter and content
 */

/**
 * Parse YAML frontmatter from entity markdown content
 * Simple frontmatter parser for client-side use
 * @param {string} content - Raw markdown content with YAML frontmatter
 * @returns {Object} Parsed frontmatter object or empty object if none found
 */
export function parse_frontmatter(content) {
  if (!content || typeof content !== 'string') {
    return {}
  }

  // Match YAML frontmatter pattern: ---\n...yaml...\n---
  const frontmatter_match = content.match(/^---\s*\n([\s\S]*?)\n---/)
  if (!frontmatter_match) {
    return {}
  }

  const yaml_content = frontmatter_match[1]

  try {
    // Simple YAML parser for basic key-value pairs
    // This is a minimal implementation for client-side use
    const frontmatter = {}
    const lines = yaml_content.split('\n')

    for (const line of lines) {
      const trimmed_line = line.trim()
      if (!trimmed_line || trimmed_line.startsWith('#')) continue

      const colon_index = trimmed_line.indexOf(':')
      if (colon_index === -1) continue

      const key = trimmed_line.substring(0, colon_index).trim()
      let value = trimmed_line.substring(colon_index + 1).trim()

      // Remove quotes if present
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }

      // Handle boolean values
      if (value === 'true') value = true
      if (value === 'false') value = false

      // Handle null/undefined values
      if (value === 'null' || value === '~') value = null

      frontmatter[key] = value
    }

    return frontmatter
  } catch (error) {
    console.warn('Failed to parse frontmatter:', error)
    return {}
  }
}

/**
 * Extract description from markdown content
 * Gets the first non-empty paragraph or heading
 * @param {string} content - Markdown content (without frontmatter)
 * @param {number} max_length - Maximum length for description (default: 160)
 * @returns {string} Extracted description or empty string
 */
export function extract_description_from_content(content, max_length = 160) {
  if (!content || typeof content !== 'string') {
    return ''
  }

  const lines = content.split('\n')

  for (const line of lines) {
    const trimmed = line.trim()

    // Skip empty lines, headers, code blocks, and other markdown syntax
    if (
      !trimmed ||
      trimmed.startsWith('#') ||
      trimmed.startsWith('```') ||
      trimmed.startsWith('---') ||
      trimmed.startsWith('|') ||
      trimmed.startsWith('>') ||
      trimmed.startsWith('-') ||
      trimmed.startsWith('*') ||
      trimmed.startsWith('1.')
    ) {
      continue
    }

    // Found a content line, extract description
    let description = trimmed
    if (description.length > max_length) {
      description = description.substring(0, max_length) + '...'
    }

    return description
  }

  return ''
}

/**
 * Extract tags from various entity properties
 * @param {Object} frontmatter - Parsed frontmatter object
 * @returns {Array} Array of tags
 */
export function extract_tags(frontmatter) {
  const tags = []

  // Check for direct tags property
  if (frontmatter.tags) {
    if (Array.isArray(frontmatter.tags)) {
      tags.push(...frontmatter.tags)
    } else if (typeof frontmatter.tags === 'string') {
      // Handle comma-separated tags
      tags.push(
        ...frontmatter.tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean)
      )
    }
  }

  // Add entity type as a tag if present
  if (frontmatter.type) {
    tags.push(frontmatter.type)
  }

  // Add status as a tag if present and meaningful
  if (frontmatter.status && frontmatter.status !== 'unknown') {
    tags.push(frontmatter.status.toLowerCase())
  }

  // Add priority as a tag if present and meaningful
  if (frontmatter.priority && frontmatter.priority !== 'medium') {
    tags.push(`priority-${frontmatter.priority.toLowerCase()}`)
  }

  return [...new Set(tags)] // Remove duplicates
}

/**
 * Generate appropriate meta description from entity data
 * @param {Object} frontmatter - Parsed frontmatter object
 * @param {string} content - Markdown content
 * @param {string} entity_type - Entity type for fallback descriptions
 * @returns {string} Meta description
 */
export function generate_meta_description(
  frontmatter,
  content,
  entity_type = 'entity'
) {
  // Use explicit description from frontmatter
  if (frontmatter.description) {
    return frontmatter.description
  }

  if (frontmatter.short_description) {
    return frontmatter.short_description
  }

  // Extract description from content
  const content_description = extract_description_from_content(content)
  if (content_description) {
    return content_description
  }

  // Generate fallback description based on entity type and other properties
  const type_label = entity_type
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (l) => l.toUpperCase())

  if (frontmatter.title || frontmatter.name) {
    return `${type_label}: ${frontmatter.title || frontmatter.name}`
  }

  return `${type_label} from Base system`
}

/**
 * Extract entity type from file path if not in frontmatter
 * @param {string} file_path - File path like 'task/base/my-task.md'
 * @returns {string} Entity type or 'entity'
 */
export function extract_entity_type_from_path(file_path) {
  if (!file_path || typeof file_path !== 'string') {
    return 'entity'
  }

  const parts = file_path.split('/')
  if (parts.length > 0 && parts[0]) {
    return parts[0]
  }

  return 'entity'
}

/**
 * Extract title from file path if not in frontmatter
 * @param {string} file_path - File path like 'task/base/my-task.md'
 * @returns {string} Human-readable title
 */
export function extract_title_from_path(file_path) {
  if (!file_path || typeof file_path !== 'string') {
    return 'Entity'
  }

  const filename = file_path.split('/').pop()?.replace('.md', '') || 'entity'

  // Convert kebab-case to title case
  return filename
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

/**
 * Main function to extract comprehensive metadata from entity content
 * @param {Object} params - Parameters object
 * @param {string} params.content - Raw entity content with frontmatter
 * @param {string} [params.file_path] - File path for fallback data
 * @param {boolean} [params.is_private] - Whether content should be treated as private
 * @returns {Object} Extracted metadata object
 */
export function extract_entity_metadata({
  content,
  file_path = '',
  is_private = false
}) {
  if (!content || typeof content !== 'string') {
    return {
      title: 'Entity',
      description: 'Entity from Base system',
      tags: [],
      type: 'entity',
      published_time: null,
      modified_time: null,
      is_private
    }
  }

  // Parse frontmatter
  const frontmatter = parse_frontmatter(content)

  // Extract markdown content (after frontmatter)
  const markdown_content = content.replace(/^---\s*\n[\s\S]*?\n---\n?/, '')

  // Determine entity type
  const entity_type =
    frontmatter.type || extract_entity_type_from_path(file_path)

  // Handle private content
  if (is_private) {
    return {
      title: 'Private Content',
      description:
        'This content is private and not available for public viewing',
      tags: [entity_type],
      type: entity_type,
      published_time: null,
      modified_time: null,
      is_private: true
    }
  }

  // Extract metadata
  const title =
    frontmatter.title || frontmatter.name || extract_title_from_path(file_path)
  const description = generate_meta_description(
    frontmatter,
    markdown_content,
    entity_type
  )
  const tags = extract_tags(frontmatter)

  return {
    title,
    description,
    tags,
    type: entity_type,
    published_time: frontmatter.created_at || null,
    modified_time: frontmatter.updated_at || frontmatter.created_at || null,
    is_private: false,
    // Additional metadata that might be useful
    status: frontmatter.status || null,
    priority: frontmatter.priority || null,
    entity_id: frontmatter.entity_id || null
  }
}

export default extract_entity_metadata
