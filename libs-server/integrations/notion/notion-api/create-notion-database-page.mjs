/**
 * Create new pages in Notion databases
 */

import debug from 'debug'
import {
  get_notion_api_client,
  clean_notion_id
} from './create-notion-client.mjs'

const log = debug('integrations:notion:api:create-database-page')

/**
 * Create a new page in a Notion database
 * @param {string} database_id - The ID of the parent database
 * @param {Object} properties - Page properties matching database schema
 * @param {Array} children - Optional content blocks for the page
 * @returns {Object} Created page object
 */
export async function create_notion_database_page(
  database_id,
  properties,
  children = null
) {
  const notion = get_notion_api_client()
  if (!notion) {
    throw new Error('Notion client not available - check API key configuration')
  }

  try {
    const clean_db_id = clean_notion_id(database_id)
    log(`Creating database page in: ${clean_db_id}`)

    const page_params = {
      parent: { database_id: clean_db_id },
      properties
    }

    // Add content blocks if provided
    if (children && children.length > 0) {
      page_params.children = children
    }

    const created_page = await notion.pages.create(page_params)

    log(`Successfully created database page: ${created_page.id}`)
    return created_page
  } catch (error) {
    log(`Failed to create database page: ${error.message}`)
    throw new Error(`Failed to create Notion database page: ${error.message}`)
  }
}

/**
 * Create a database page with rich text content
 * @param {string} database_id - The ID of the parent database
 * @param {Object} properties - Page properties
 * @param {string} content - Markdown content to convert to blocks
 * @returns {Object} Created page object
 */
export async function create_notion_database_page_with_content(
  database_id,
  properties,
  content
) {
  // For now, create without content - we'll implement markdown->blocks conversion later
  // This is a placeholder for future enhancement
  const children = content
    ? [
        {
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [
              {
                type: 'text',
                text: { content }
              }
            ]
          }
        }
      ]
    : null

  return await create_notion_database_page(database_id, properties, children)
}
