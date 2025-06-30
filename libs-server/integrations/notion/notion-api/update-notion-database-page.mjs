/**
 * Update existing pages in Notion databases
 */

import debug from 'debug'
import { get_notion_client, clean_notion_id } from './create-notion-client.mjs'

const log = debug('integrations:notion:api:update-database-page')

/**
 * Update a database page's properties
 * @param {string} page_id - The ID of the page to update
 * @param {Object} properties - Properties to update
 * @param {Object} options - Additional options
 * @param {boolean} options.archived - Whether to archive the page
 * @returns {Object} Updated page object
 */
export async function update_notion_database_page(
  page_id,
  properties,
  options = {}
) {
  const notion = get_notion_client()
  if (!notion) {
    throw new Error('Notion client not available - check API key configuration')
  }

  try {
    const clean_id = clean_notion_id(page_id)
    log(`Updating database page: ${clean_id}`)

    const update_params = {
      page_id: clean_id,
      properties
    }

    // Include archived status if specified
    if (options.archived !== undefined) {
      update_params.archived = options.archived
    }

    const updated_page = await notion.pages.update(update_params)

    log(`Successfully updated database page: ${clean_id}`)
    return updated_page
  } catch (error) {
    log(`Failed to update database page: ${error.message}`)
    throw new Error(`Failed to update Notion database page: ${error.message}`)
  }
}

/**
 * Update database page content blocks
 * @param {string} page_id - The ID of the page to update
 * @param {Array} new_blocks - New content blocks to replace existing content
 * @returns {Object} Result of the block update operation
 */
export async function update_notion_database_page_content(page_id, new_blocks) {
  const notion = get_notion_client()
  if (!notion) {
    throw new Error('Notion client not available - check API key configuration')
  }

  try {
    const clean_id = clean_notion_id(page_id)
    log(`Updating database page content: ${clean_id}`)

    // First, get existing blocks to replace them
    const existing_blocks = await notion.blocks.children.list({
      block_id: clean_id,
      page_size: 100
    })

    // Delete existing blocks (if any)
    if (existing_blocks.results.length > 0) {
      for (const block of existing_blocks.results) {
        await notion.blocks.delete({ block_id: block.id })
      }
    }

    // Add new blocks
    if (new_blocks && new_blocks.length > 0) {
      const result = await notion.blocks.children.append({
        block_id: clean_id,
        children: new_blocks
      })

      log(
        `Successfully updated database page content with ${new_blocks.length} blocks`
      )
      return result
    }

    log('Cleared database page content (no new blocks added)')
    return { success: true }
  } catch (error) {
    log(`Failed to update database page content: ${error.message}`)
    throw new Error(
      `Failed to update Notion database page content: ${error.message}`
    )
  }
}
