/**
 * Get Notion page with full content blocks
 */

import debug from 'debug'
import { get_notion_client, clean_notion_id } from './create-notion-client.mjs'

const log = debug('integrations:notion:api:get-page-with-blocks')

/**
 * Recursively retrieve all blocks in a page/block
 * @param {string} block_id - The block ID to retrieve children for
 * @param {Client} notion - Notion client instance
 * @returns {Array} Array of block objects with nested children
 */
async function get_all_block_children(block_id, notion) {
  const blocks = []
  let start_cursor
  let has_more = true

  while (has_more) {
    const response = await notion.blocks.children.list({
      block_id,
      start_cursor,
      page_size: 100
    })

    // Process each block and recursively get children if they exist
    for (const block of response.results) {
      if (block.has_children) {
        // Skip recursive fetching for child pages and child databases
        // These should be handled as references, not content merging
        if (block.type === 'child_page' || block.type === 'child_database') {
          log(
            `Skipping recursive fetch for ${block.type} to prevent content merging`
          )
        } else {
          block.children = await get_all_block_children(block.id, notion)
        }
      }
      blocks.push(block)
    }

    has_more = response.has_more
    start_cursor = response.next_cursor
  }

  return blocks
}

/**
 * Get a Notion page with all its content blocks
 * @param {string} page_id - The ID of the page to retrieve
 * @returns {Object} Page object with blocks array
 */
export async function get_notion_page_with_blocks(page_id) {
  const notion = get_notion_client()
  if (!notion) {
    throw new Error('Notion client not available - check API key configuration')
  }

  try {
    const clean_id = clean_notion_id(page_id)
    log(`Retrieving page with blocks: ${clean_id}`)

    // Get the page properties first
    const page = await notion.pages.retrieve({ page_id: clean_id })

    // Get all blocks/content for the page
    const blocks = await get_all_block_children(clean_id, notion)

    // Combine page and blocks
    const page_with_blocks = {
      ...page,
      blocks
    }

    log(`Retrieved page with ${blocks.length} top-level blocks`)
    return page_with_blocks
  } catch (error) {
    log(`Failed to retrieve page with blocks: ${error.message}`)
    throw new Error(`Failed to get Notion page with blocks: ${error.message}`)
  }
}
