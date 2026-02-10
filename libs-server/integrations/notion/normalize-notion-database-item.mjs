/**
 * Normalize Notion database items to Base entity format
 */

import debug from 'debug'
import {
  extract_and_map_properties,
  convert_blocks_to_markdown,
  create_base_entity_structure,
  extract_page_title,
  validate_and_clean_entity,
  apply_property_conversions,
  normalize_notion_properties_text
} from './notion-utils.mjs'

const log = debug('integrations:notion:normalize-database-item')

/**
 * Normalize a Notion database item to Base entity format
 * @param {Object} notion_page - Notion database page object
 * @param {Object} mapping_config - Entity mapping configuration
 * @param {string} database_id - Source database ID
 * @returns {Promise<Object>} Normalized entity data
 */
export async function normalize_notion_database_item(
  notion_page,
  mapping_config,
  database_id,
  options = {}
) {
  try {
    log(`Normalizing Notion database item: ${notion_page.id}`)

    // Extract and map all properties using shared function
    const { extracted_properties, mapped_properties } =
      extract_and_map_properties(notion_page, mapping_config)

    // Apply type conversions to mapped properties
    const conversion_rules = options.conversion_rules || {}
    const converted_properties = apply_property_conversions(
      mapped_properties,
      mapping_config,
      conversion_rules
    )

    // Attach extracted properties to notion_page for title extraction
    notion_page.extracted_properties = extracted_properties

    // Determine entity type from mapping config
    const entity_type = mapping_config?.entity_type || 'physical_item'

    // Extract title using shared logic with converted properties
    const name = extract_page_title(notion_page, converted_properties)

    // Convert page content blocks to markdown if available
    // Pass entity_files_directory for entity-adjacent file storage
    const content = await convert_blocks_to_markdown(notion_page.blocks || [], {
      entity_files_directory: options.entity_files_directory
    })

    // Create base entity structure using shared function
    const { entity_properties, entity_content } = create_base_entity_structure(
      notion_page,
      {
        entity_type,
        name,
        title: name,
        content,
        external_id: `notion:database:${database_id}:${notion_page.id}`,
        user_public_key: options.user_public_key,
        additional_properties: {
          ...converted_properties,
          notion_metadata: {
            notion_id: notion_page.id,
            database_id,
            notion_url: notion_page.url,
            created_by: notion_page.created_by,
            last_edited_by: notion_page.last_edited_by,
            archived: notion_page.archived || false,
            raw_properties: normalize_notion_properties_text(extracted_properties)
          }
        }
      }
    )

    // Validate and clean entity before return
    const cleaned_entity = validate_and_clean_entity(entity_properties, {
      entity_type,
      required_fields: ['name', 'title'],
      schema: options.schema,
      conversion_rules
    })

    log(
      `Normalized database item to ${entity_type} entity: ${cleaned_entity.name}`
    )
    return {
      entity_properties: cleaned_entity,
      entity_content
    }
  } catch (error) {
    log(`Failed to normalize Notion database item: ${error.message}`)
    throw new Error(
      `Failed to normalize Notion database item: ${error.message}`
    )
  }
}
