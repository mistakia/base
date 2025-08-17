/**
 * Shared utilities for Notion integration normalization
 */

import debug from 'debug'
import { notion_blocks_to_markdown } from './blocks/notion-blocks-to-markdown.mjs'

const log = debug('integrations:notion:utils')

/**
 * Extract and format rich text from Notion rich text array
 * Supports plain text extraction and full formatting preservation with color support
 * @param {Array} rich_text - Notion rich text array
 * @param {Object} options - Formatting options
 * @param {boolean} options.preserve_formatting - Whether to preserve rich text formatting
 * @returns {string} Plain text content or formatted text
 */
export function extract_plain_text(rich_text, options = {}) {
  if (!Array.isArray(rich_text)) return ''

  // Plain text only mode
  if (!options.preserve_formatting) {
    return rich_text.map((item) => item.plain_text || '').join('')
  }

  // Full formatting preservation with enhanced features
  return rich_text
    .map((item) => {
      let text = item.plain_text || ''

      if (item.annotations) {
        const annotations = item.annotations

        if (annotations.bold) text = `**${text}**`
        if (annotations.italic) text = `*${text}*`
        if (annotations.strikethrough) text = `~~${text}~~`
        if (annotations.underline) text = `<u>${text}</u>`
        if (annotations.code) text = `\`${text}\``

        if (item.href) {
          text = `[${text}](${item.href})`
        }

        // Handle colors (enhanced feature for full formatting mode)
        if (annotations.color && annotations.color !== 'default') {
          text = `<span style="color: ${annotations.color}">${text}</span>`
        }
      }

      return text
    })
    .join('')
}

/**
 * Convert Notion blocks to markdown content using advanced converter
 * @param {Array} blocks - Array of Notion block objects
 * @param {Object} options - Conversion options
 * @returns {Promise<string>} Markdown content
 */
export async function convert_blocks_to_markdown(blocks, options = {}) {
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return ''
  }

  return await notion_blocks_to_markdown(blocks, {
    preserve_formatting: true,
    include_ids: false,
    ...options
  })
}

/**
 * Create base entity structure common to all Notion entities
 * @param {Object} notion_page - Notion page object
 * @param {Object} params - Entity parameters
 * @returns {Object} Object with entity_properties and entity_content
 * @returns {Object} return.entity_properties - Entity properties for frontmatter
 * @returns {string} return.entity_content - Entity content for markdown body
 */
export function create_base_entity_structure(notion_page, params) {
  const {
    entity_type,
    name,
    title,
    content,
    external_id,
    user_public_key = '00000000-0000-0000-0000-000000000000',
    additional_properties = {}
  } = params

  const entity_properties = {
    type: entity_type,
    name: name || 'Untitled',
    title: title || name || 'Untitled',
    external_id,
    created_at: notion_page.created_time || new Date().toISOString(),
    updated_at: notion_page.last_edited_time || new Date().toISOString(),
    user_public_key,

    // Add any additional mapped properties
    ...additional_properties,

    // Standard Notion metadata
    notion_metadata: {
      notion_id: notion_page.id,
      notion_url: notion_page.url,
      created_by: notion_page.created_by,
      last_edited_by: notion_page.last_edited_by,
      archived: notion_page.archived || false,
      properties: notion_page.properties || {}
    }
  }

  // Return separate entity properties and content
  return {
    entity_properties,
    entity_content: content || ''
  }
}

/**
 * Generate appropriate description for entity based on available content
 * @param {Object} entity - Entity object
 * @param {string} content - Main content
 * @param {Object} options - Generation options
 * @returns {string} Generated description
 */
export function generate_entity_description(entity, content, options = {}) {
  const { entity_type = 'text', fallback_prefix = 'Entity' } = options

  // Use existing description if present
  if (entity.description && entity.description.trim()) {
    return entity.description.trim()
  }

  // Use content if available
  if (content && content.trim().length > 0) {
    return content.length > 200 ? content.substring(0, 200) + '...' : content
  }

  // For physical_item entities, try manufacturer-based description
  if (entity_type === 'physical_item') {
    if (entity.manufacturer) {
      return `${entity.name} manufactured by ${entity.manufacturer}`
    }
    return `Physical item: ${entity.name}`
  }

  // For text entities
  if (entity_type === 'text') {
    return `Notion page: ${entity.name}`
  }

  // Generic fallback
  return `${fallback_prefix}: ${entity.name}`
}

/**
 * Extract title from Notion page properties with fallback logic
 * @param {Object} notion_page - Notion page object
 * @param {Object} mapped_properties - Pre-mapped properties
 * @returns {string} Extracted title
 */
export function extract_page_title(notion_page, mapped_properties = {}) {
  // First priority: Use mapped 'name' property if available
  if (
    mapped_properties.name &&
    typeof mapped_properties.name === 'string' &&
    mapped_properties.name.trim()
  ) {
    return mapped_properties.name.trim()
  }

  // Second priority: Direct title property
  if (notion_page.properties?.title?.title) {
    return extract_plain_text(notion_page.properties.title.title)
  }

  // Third priority: Any title-type property
  if (notion_page.properties) {
    const title_props = Object.values(notion_page.properties).find(
      (prop) => prop.type === 'title' && prop.title
    )
    if (title_props) {
      return extract_plain_text(title_props.title)
    }
  }

  // Fourth priority: Look for name/title-like properties in any extracted data
  const extracted_properties = notion_page.extracted_properties || {}
  const title_prop = Object.entries(extracted_properties).find(
    ([key, value]) =>
      typeof value === 'string' &&
      value.trim() &&
      (key.toLowerCase().includes('name') ||
        key.toLowerCase().includes('title'))
  )

  if (title_prop) {
    return title_prop[1].trim()
  }

  return 'Untitled'
}

/**
 * Extract value from Notion property based on type
 * @param {Object} property - Notion property object
 * @returns {any} Extracted value
 */
export function extract_property_value(property) {
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
      return property.multi_select
        ? property.multi_select.map((item) => item.name)
        : []

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
        return property.rollup.array.map((item) => extract_property_value(item))
      }
      return null

    case 'relation':
      // Return array of related page IDs
      return property.relation ? property.relation.map((item) => item.id) : []

    case 'people':
      // Return array of user IDs/names
      return property.people
        ? property.people.map((person) => ({
            id: person.id,
            name: person.name || person.plain_text
          }))
        : []

    case 'files':
      // Return array of file URLs/names
      return property.files
        ? property.files.map((file) => ({
            name: file.name,
            url: file.file?.url || file.external?.url
          }))
        : []

    case 'created_time':
      return property.created_time

    case 'created_by':
      return property.created_by
        ? {
            id: property.created_by.id,
            name: property.created_by.name
          }
        : null

    case 'last_edited_time':
      return property.last_edited_time

    case 'last_edited_by':
      return property.last_edited_by
        ? {
            id: property.last_edited_by.id,
            name: property.last_edited_by.name
          }
        : null

    default:
      log(`Unsupported property type: ${property.type}`)
      return null
  }
}

/**
 * Extract all properties from Notion page and apply mappings
 * @param {Object} notion_page - Notion page object
 * @param {Object} mapping_config - Property mapping configuration
 * @returns {Object} Object with extracted and mapped properties
 */
export function extract_and_map_properties(notion_page, mapping_config = {}) {
  // Extract all raw properties
  const extracted_properties = {}
  if (notion_page.properties) {
    for (const [prop_name, prop_data] of Object.entries(
      notion_page.properties
    )) {
      extracted_properties[prop_name] = extract_property_value(prop_data)
    }
  }

  // Apply property mappings from configuration
  const mapped_properties = {}
  if (mapping_config?.property_mappings) {
    for (const [entity_field, notion_property] of Object.entries(
      mapping_config.property_mappings
    )) {
      if (extracted_properties[notion_property] !== undefined) {
        mapped_properties[entity_field] = extracted_properties[notion_property]
      }
    }
  }

  return {
    extracted_properties,
    mapped_properties
  }
}

/**
 * Apply type conversion to a value based on conversion rule
 * @param {any} value - Raw value to convert
 * @param {string} conversion_type - Type of conversion to apply
 * @param {Object} conversion_rules - Conversion rules from config
 * @returns {any} Converted value
 */
export function apply_type_conversion(
  value,
  conversion_type,
  conversion_rules = {}
) {
  if (value === null || value === undefined) return value

  const rule = conversion_rules[conversion_type]
  if (!rule) {
    log(`No conversion rule found for type: ${conversion_type}`)
    return value
  }

  // Handle boolean conversions
  if (
    conversion_type === 'select_to_boolean' ||
    rule.true_values ||
    rule.false_values
  ) {
    if (rule.true_values?.includes(value)) return true
    if (rule.false_values?.includes(value)) return false
    return rule.default ?? false
  }

  // Handle enum conversions (any conversion with enum_mappings)
  if (rule.enum_mappings) {
    for (const [enum_value, possible_inputs] of Object.entries(
      rule.enum_mappings
    )) {
      if (possible_inputs.includes(value)) {
        log(
          `Converted enum value '${value}' -> '${enum_value}' (${conversion_type})`
        )
        return enum_value
      }
    }
    log(
      `Invalid enum value '${value}' for ${conversion_type}, using default: ${rule.default}`
    )
    return rule.default
  }

  // Handle other custom conversion types
  if (rule.convert_function) {
    try {
      return rule.convert_function(value)
    } catch (error) {
      log(`Conversion function failed for ${conversion_type}: ${error.message}`)
      return rule.default ?? value
    }
  }

  log(`Unknown conversion rule structure for type: ${conversion_type}`)
  return value
}

/**
 * Apply type conversions to mapped properties
 * @param {Object} mapped_properties - Properties to convert
 * @param {Object} mapping_config - Configuration with type conversions
 * @param {Object} conversion_rules - Global conversion rules
 * @returns {Object} Properties with conversions applied
 */
export function apply_property_conversions(
  mapped_properties,
  mapping_config = {},
  conversion_rules = {}
) {
  const converted_properties = { ...mapped_properties }

  if (!mapping_config.type_conversions) {
    return converted_properties
  }

  // Apply conversions for each property
  for (const [notion_property, conversion_type] of Object.entries(
    mapping_config.type_conversions
  )) {
    // Find the entity property that maps to this notion property
    const entity_property = Object.entries(
      mapping_config.property_mappings || {}
    ).find(([entity_prop, notion_prop]) => notion_prop === notion_property)?.[0]

    if (
      entity_property &&
      converted_properties[entity_property] !== undefined
    ) {
      const original_value = converted_properties[entity_property]
      const converted_value = apply_type_conversion(
        original_value,
        conversion_type,
        conversion_rules
      )

      if (converted_value !== original_value) {
        log(
          `Converted ${entity_property}: '${original_value}' -> '${converted_value}' (${conversion_type})`
        )
        converted_properties[entity_property] = converted_value
      }
    }
  }

  return converted_properties
}

/**
 * Apply field-specific cleaning based on entity schema and conversion rules
 * @param {Object} entity - Entity to clean
 * @param {Object} schema - Entity schema definition
 * @param {Object} conversion_rules - Conversion rules from config
 * @returns {Object} Entity with cleaned field values
 */
export function clean_entity_fields_by_schema(
  entity,
  schema = null,
  conversion_rules = {}
) {
  const cleaned = { ...entity }

  if (!schema || !schema.properties) {
    return cleaned
  }

  // Process each property defined in the schema
  for (const property of schema.properties) {
    const field_name = property.name
    if (!field_name || cleaned[field_name] === undefined) continue

    const field_value = cleaned[field_name]

    // Apply conversions based on field type
    if (property.type === 'boolean' && typeof field_value === 'string') {
      // Use select_to_boolean rule if available, or fallback to default boolean conversion
      const boolean_rule = conversion_rules.select_to_boolean || {
        true_values: ['True', 'true', 'Yes', 'yes', '1', 1, true],
        false_values: ['False', 'false', 'No', 'no', '0', 0, false],
        default: false
      }

      cleaned[field_name] = apply_type_conversion(
        field_value,
        'select_to_boolean',
        {
          select_to_boolean: boolean_rule
        }
      )
    }

    // Apply enum cleaning if field has enum values
    if (property.enum && Array.isArray(property.enum)) {
      // Look for a specific conversion rule for this field
      const enum_conversion_rule = Object.entries(conversion_rules).find(
        ([rule_name, rule]) =>
          rule.enum_mappings &&
          Object.keys(rule.enum_mappings).some((enum_key) =>
            property.enum.includes(enum_key)
          )
      )

      if (enum_conversion_rule) {
        const [rule_name] = enum_conversion_rule
        cleaned[field_name] = apply_type_conversion(
          field_value,
          rule_name,
          conversion_rules
        )
      } else if (typeof field_value === 'string') {
        // Fallback: try to match case-insensitively or find in enum values
        const exact_match = property.enum.find(
          (enum_val) => enum_val === field_value
        )
        if (!exact_match) {
          const case_insensitive_match = property.enum.find(
            (enum_val) => enum_val.toLowerCase() === field_value.toLowerCase()
          )
          if (case_insensitive_match) {
            cleaned[field_name] = case_insensitive_match
            log(
              `Fixed enum case: ${field_name} '${field_value}' -> '${case_insensitive_match}'`
            )
          }
        }
      }
    }
  }

  return cleaned
}

/**
 * Validate and clean entity before return
 * @param {Object} entity - Entity to validate
 * @param {Object} options - Validation options
 * @param {Object} options.entity_type - Entity type for schema lookup
 * @param {Array} options.required_fields - Required fields to validate
 * @param {Object} options.schema - Entity schema definition (optional)
 * @param {Object} options.conversion_rules - Conversion rules (optional)
 * @returns {Object} Cleaned entity
 */
export function validate_and_clean_entity(entity, options = {}) {
  const {
    entity_type,
    required_fields = [],
    schema = null,
    conversion_rules = {}
  } = options

  // Ensure required fields are present
  let cleaned_entity = { ...entity }

  // Apply schema-based field cleaning if schema is provided
  if (schema) {
    cleaned_entity = clean_entity_fields_by_schema(
      cleaned_entity,
      schema,
      conversion_rules
    )
  }

  // Ensure description exists
  if (!cleaned_entity.description) {
    cleaned_entity.description = generate_entity_description(
      cleaned_entity,
      cleaned_entity.content,
      { entity_type }
    )
  }

  // Clean up any undefined or null values
  Object.keys(cleaned_entity).forEach((key) => {
    if (cleaned_entity[key] === undefined) {
      delete cleaned_entity[key]
    }
  })

  // Validate required fields
  required_fields.forEach((field) => {
    if (!cleaned_entity[field]) {
      log(`Warning: Required field '${field}' is missing or empty`)
    }
  })

  return cleaned_entity
}
