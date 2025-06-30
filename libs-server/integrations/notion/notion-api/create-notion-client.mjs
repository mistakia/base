/**
 * Create and configure Notion client
 */

import { Client } from '@notionhq/client'
import debug from 'debug'
import config from '#config'

const log = debug('integrations:notion:client')

/**
 * Clean an ID by removing dashes (Notion API compatibility)
 * @param {string} id - The ID to clean
 * @returns {string} Cleaned ID
 */
export function clean_notion_id(id) {
  return id ? id.replace(/-/g, '') : id
}

/**
 * Create authenticated Notion client
 * @returns {Client|null} Notion client instance or null if no API key
 */
export function create_notion_client() {
  if (!config.notion?.api_key) {
    log('Notion API key not configured')
    return null
  }

  const client = new Client({
    auth: config.notion.api_key,
    notionVersion: '2022-06-28' // Use stable API version
  })

  log('Notion client created successfully')
  return client
}

/**
 * Get configured Notion client (singleton pattern)
 */
let _notion_client = null

export function get_notion_client() {
  if (!_notion_client) {
    _notion_client = create_notion_client()
  }
  return _notion_client
}
