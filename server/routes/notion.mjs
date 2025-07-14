/**
 * Notion API routes
 */

import express from 'express'
import debug from 'debug'

import {
  sync_notion_database_to_entities,
  sync_all_notion_databases_to_entities,
  sync_notion_bidirectional
} from '#libs-server/integrations/notion/index.mjs'

import { get_notion_api_client } from '#libs-server/integrations/notion/notion-api/index.mjs'

const log = debug('routes:notion')
const router = express.Router()

/**
 * Get Notion sync status
 */
router.get('/status', async (req, res) => {
  try {
    const notion_client = get_notion_api_client()
    const status = {
      client_available: !!notion_client,
      timestamp: new Date().toISOString()
    }

    res.json(status)
  } catch (error) {
    log(`Error getting Notion status: ${error.message}`)
    res.status(500).json({ error: error.message })
  }
})

/**
 * Trigger manual sync from Notion to entities
 */
router.post('/sync', async (req, res) => {
  try {
    const { database_id, options = {} } = req.body

    let result
    if (database_id) {
      // Sync specific database
      result = await sync_notion_database_to_entities(database_id, options)
    } else {
      // Sync all configured databases
      result = await sync_all_notion_databases_to_entities(options)
    }

    res.json({
      success: true,
      result,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    log(`Error in Notion sync: ${error.message}`)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

/**
 * Sync specific entity to Notion
 */
router.post('/entity/:id/sync', async (req, res) => {
  try {
    const { id } = req.params

    // This would need to load the entity by ID first
    // For now, return a placeholder response
    res.json({
      success: true,
      message: 'Entity to Notion sync not fully implemented yet',
      entity_id: id,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    log(`Error syncing entity to Notion: ${error.message}`)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

/**
 * Get available Notion databases
 */
router.get('/databases', async (req, res) => {
  try {
    const notion = get_notion_api_client()
    if (!notion) {
      return res.status(503).json({
        error: 'Notion client not available - check API key configuration'
      })
    }

    // Search for databases
    const response = await notion.search({
      filter: {
        property: 'object',
        value: 'database'
      },
      page_size: 100
    })

    const databases = response.results.map((db) => ({
      id: db.id,
      title: db.title?.map((t) => t.plain_text).join('') || 'Untitled',
      url: db.url,
      created_time: db.created_time,
      last_edited_time: db.last_edited_time,
      properties: Object.keys(db.properties || {})
    }))

    res.json({
      databases,
      count: databases.length,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    log(`Error listing Notion databases: ${error.message}`)
    res.status(500).json({ error: error.message })
  }
})

/**
 * Perform bi-directional sync
 */
router.post('/sync/bidirectional', async (req, res) => {
  try {
    const { options = {} } = req.body

    const result = await sync_notion_bidirectional(options)

    res.json({
      success: true,
      result,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    log(`Error in bi-directional sync: ${error.message}`)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

export default router
