/**
 * Normalize Notion database items to Base entity format
 */

import debug from 'debug'
import { randomUUID } from 'crypto'

const log = debug('integrations:notion:normalize-database-item')

/**
 * Extract plain text from Notion rich text array
 * @param {Array} rich_text - Notion rich text array
 * @returns {string} Plain text content
 */
function extract_plain_text(rich_text) {
  if (!Array.isArray(rich_text)) return ''
  return rich_text.map(item => item.plain_text || '').join('')
}

/**
 * Extract value from Notion property based on type
 * @param {Object} property - Notion property object
 * @returns {any} Extracted value
 */
function extract_property_value(property) {
  if (!property || !property.type) return null

  switch (property.type) {
    case 'title':
      return property.title ? extract_plain_text(property.title) : ''

    case 'rich_text':
      return property.rich_text ? extract_plain_text(property.rich_text) : ''

    case 'number':
      return property.number

    case 'select':
      return property.select ? property.select.name : null

    case 'multi_select':
      return property.multi_select ? property.multi_select.map(item => item.name) : []

    case 'date':
      if (property.date) {
        return property.date.start
      }
      return null

    case 'checkbox':
      return property.checkbox

    case 'url':
      return property.url

    case 'email':
      return property.email

    case 'phone_number':
      return property.phone_number

    case 'formula':
      // Extract the computed value based on formula result type
      if (property.formula) {
        const result = property.formula
        if (result.type === 'string') return result.string
        if (result.type === 'number') return result.number
        if (result.type === 'boolean') return result.boolean
        if (result.type === 'date') return result.date?.start
      }
      return null

    case 'rollup':
      // Handle rollup properties - simplified for now
      if (property.rollup && property.rollup.array) {
        return property.rollup.array.map(item => extract_property_value(item))
      }
      return null

    case 'relation':
      // Return array of related page IDs
      return property.relation ? property.relation.map(item => item.id) : []

    case 'people':
      // Return array of user IDs/names
      return property.people ? property.people.map(person => ({
        id: person.id,
        name: person.name || person.plain_text
      })) : []

    case 'files':
      // Return array of file URLs/names
      return property.files ? property.files.map(file => ({
        name: file.name,
        url: file.file?.url || file.external?.url
      })) : []

    case 'created_time':
      return property.created_time

    case 'created_by':
      return property.created_by ? {
        id: property.created_by.id,
        name: property.created_by.name
      } : null

    case 'last_edited_time':
      return property.last_edited_time

    case 'last_edited_by':
      return property.last_edited_by ? {
        id: property.last_edited_by.id,
        name: property.last_edited_by.name
      } : null

    default:
      log(`Unsupported property type: ${property.type}`)
      return null
  }
}

/**
 * Convert Notion blocks to markdown content (simplified version)
 * @param {Array} blocks - Array of Notion block objects
 * @returns {string} Markdown content
 */
function blocks_to_markdown_simple(blocks) {
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return ''
  }

  const text_content = []

  for (const block of blocks) {
    if (block.type === 'paragraph' && block.paragraph?.rich_text) {
      const text = extract_plain_text(block.paragraph.rich_text)
      if (text.trim()) {
        text_content.push(text)
      }
    }
    // Add more block types as needed - keeping simple for now
  }

  return text_content.join('\n\n')
}

/**
 * Normalize a Notion database item to Base entity format
 * @param {Object} notion_page - Notion database page object
 * @param {Object} mapping_config - Entity mapping configuration
 * @param {string} database_id - Source database ID
 * @returns {Object} Normalized entity data
 */
export function normalize_notion_database_item(notion_page, mapping_config, database_id) {
  try {
    log(`Normalizing Notion database item: ${notion_page.id}`)

    // Extract and convert all properties
    const extracted_properties = {}

    if (notion_page.properties) {
      for (const [prop_name, prop_data] of Object.entries(notion_page.properties)) {
        extracted_properties[prop_name] = extract_property_value(prop_data)
      }
    }

    // Apply property mappings from configuration
    const mapped_properties = {}
    if (mapping_config?.property_mappings) {
      for (const [entity_field, notion_property] of Object.entries(mapping_config.property_mappings)) {
        if (extracted_properties[notion_property] !== undefined) {
          mapped_properties[entity_field] = extracted_properties[notion_property]
        }
      }
    }

    // Determine entity type from mapping config
    const entity_type = mapping_config?.entity_type || 'physical_item'

    // Extract title (usually from a title property)
    let name = 'Untitled'
    const title_prop = Object.entries(extracted_properties).find(([key, value]) =>
      typeof value === 'string' && value.trim() &&
      (key.toLowerCase().includes('name') || key.toLowerCase().includes('title'))
    )
    if (title_prop) {
      name = title_prop[1].trim()
    } else if (mapped_properties.name) {
      name = mapped_properties.name
    }

    // Convert page content blocks to markdown if available
    const content = notion_page.blocks ? blocks_to_markdown_simple(notion_page.blocks) : ''

    // Create Base entity structure
    const entity = {
      entity_id: randomUUID(),
      type: entity_type,
      name,
      content: content || mapped_properties.content || '',
      external_id: `notion:database:${database_id}:${notion_page.id}`,
      created_at: notion_page.created_time || new Date().toISOString(),
      updated_at: notion_page.last_edited_time || new Date().toISOString(),

      // Add mapped properties as entity properties
      ...mapped_properties,

      // Additional metadata
      notion_metadata: {
        notion_id: notion_page.id,
        database_id,
        notion_url: notion_page.url,
        created_by: notion_page.created_by,
        last_edited_by: notion_page.last_edited_by,
        archived: notion_page.archived || false,
        raw_properties: extracted_properties
      }
    }

    // Add description if not already mapped
    if (!entity.description && content.length > 0) {
      entity.description = content.length > 200 ? content.substring(0, 200) + '...' : content
    }

    log(`Normalized database item to ${entity_type} entity: ${entity.name}`)
    return entity
  } catch (error) {
    log(`Failed to normalize Notion database item: ${error.message}`)
    throw new Error(`Failed to normalize Notion database item: ${error.message}`)
  }
}
