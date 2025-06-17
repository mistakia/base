/**
 * Update Notion page properties
 */

import debug from 'debug'
import { get_notion_client, clean_notion_id } from './create-notion-client.mjs'

const log = debug('integrations:notion:api:update-page-properties')

/**
 * Update properties of a Notion page
 * @param {string} page_id - The ID of the page to update
 * @param {Object} properties - Properties to update
 * @param {Object} options - Additional options
 * @param {boolean} options.archived - Whether to archive the page
 * @returns {Object} Updated page object
 */
export async function update_notion_page_properties(page_id, properties, options = {}) {
  const notion = get_notion_client()
  if (!notion) {
    throw new Error('Notion client not available - check API key configuration')
  }

  try {
    const clean_id = clean_notion_id(page_id)
    log(`Updating page properties: ${clean_id}`)

    const update_params = {
      page_id: clean_id,
      properties
    }

    // Include archived status if specified
    if (options.archived !== undefined) {
      update_params.archived = options.archived
    }

    const updated_page = await notion.pages.update(update_params)

    log(`Successfully updated page properties for: ${clean_id}`)
    return updated_page
  } catch (error) {
    log(`Failed to update page properties: ${error.message}`)
    throw new Error(`Failed to update Notion page properties: ${error.message}`)
  }
}

/**
 * Batch update multiple page properties with retry logic
 * @param {Array} updates - Array of {page_id, properties, options} objects
 * @param {Object} retry_options - Retry configuration
 * @returns {Array} Array of update results
 */
export async function batch_update_notion_page_properties(updates, retry_options = {}) {
  const { max_retries = 3, delay = 1000 } = retry_options
  const results = []

  for (const update of updates) {
    let attempts = 0
    let success = false

    while (attempts < max_retries && !success) {
      try {
        const result = await update_notion_page_properties(
          update.page_id,
          update.properties,
          update.options
        )
        results.push({ success: true, page_id: update.page_id, result })
        success = true
      } catch (error) {
        attempts++
        if (attempts >= max_retries) {
          results.push({
            success: false,
            page_id: update.page_id,
            error: error.message
          })
        } else {
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, delay * attempts))
        }
      }
    }
  }

  return results
}
