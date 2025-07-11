/**
 * Normalize Notion standalone pages to Base entity format
 */

import debug from 'debug'
import {
  convert_blocks_to_markdown,
  create_base_entity_structure,
  extract_page_title,
  validate_and_clean_entity
} from './notion-utils.mjs'

const log = debug('integrations:notion:normalize-page')

/**
 * Normalize a Notion standalone page to Base entity format
 * @param {Object} notion_page - Notion page object with blocks
 * @param {Object} options - Normalization options
 * @returns {Promise<Object>} Normalized entity data
 */
export async function normalize_notion_page(notion_page, options = {}) {
  try {
    log(`Normalizing Notion page: ${notion_page.id}`)

    // Extract title using shared logic
    const title = extract_page_title(notion_page)

    // Convert blocks to markdown content
    const content = await convert_blocks_to_markdown(notion_page.blocks || [])

    // Create base entity structure using shared function
    const { entity_properties, entity_content } = create_base_entity_structure(
      notion_page,
      {
        entity_type: 'text',
        name: title,
        title,
        content,
        external_id: `notion:page:${notion_page.id}`,
        user_id: options.user_id
      }
    )

    // Validate and clean entity before return
    const cleaned_entity = validate_and_clean_entity(entity_properties, {
      entity_type: 'text',
      required_fields: ['name', 'title']
    })

    log(`Normalized page to text entity: ${cleaned_entity.name}`)
    return {
      entity_properties: cleaned_entity,
      entity_content
    }
  } catch (error) {
    log(`Failed to normalize Notion page: ${error.message}`)
    throw new Error(`Failed to normalize Notion page: ${error.message}`)
  }
}
