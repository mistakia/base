/**
 * Notion Integration for Base System
 *
 * Provides bi-directional synchronization between Notion pages/databases
 * and Base entities, following the GitHub integration patterns.
 */

import debug from 'debug'

// Setup logger for the integration
const log = debug('integrations:notion')

// Export all integration components
export * from './notion-api/index.mjs'
export * from './normalize-notion-page.mjs'
export * from './normalize-notion-database-item.mjs'
export * from './notion-entity-mapper.mjs'
export * from './sync-notion-entities.mjs'

// Main sync functions
export { sync_notion_page_to_entity } from './sync-notion-page-to-entity.mjs'
export { sync_entity_to_notion } from './sync-entity-to-notion.mjs'

// Entity-specific operations
export {
  create_entity_from_notion_page,
  update_entity_from_notion_page,
  find_entity_for_notion_page,
  format_entity_path_for_notion
} from './entity/index.mjs'

// Block content handling
export {
  notion_blocks_to_markdown,
  markdown_to_notion_blocks
} from './blocks/index.mjs'

log('Notion integration module loaded')
