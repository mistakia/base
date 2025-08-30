import express from 'express'
import debug from 'debug'

import * as threads from '#libs-server/threads/index.mjs'
import {
  check_thread_permission,
  apply_redaction_interceptor
} from '#server/middleware/permissions.mjs'
import { process_table_request } from '#libs-server/threads/process-table-request.mjs'

const router = express.Router()
const log = debug('api:threads')

// Apply redaction interceptor to all thread routes
router.use(apply_redaction_interceptor())

/**
 * Handle errors consistently
 */
function handle_errors(res, error, operation) {
  log(`Error ${operation}: ${error.message}`)
  res.status(500).json({
    error: `Failed to ${operation}`,
    message: error.message
  })
}

// Get all threads with optional filtering
router.get('/', async (req, res) => {
  try {
    const { user_public_key, thread_state } = req.query
    const limit = parseInt(req.query.limit) || 1000
    const offset = parseInt(req.query.offset) || 0

    // Use provided public key or default to null for all users
    const query_user_public_key = user_public_key

    // Filter threads based on user permissions
    const requesting_user_public_key =
      req.user?.user_public_key ||
      req.permission_context?.user_public_key ||
      null

    const thread_list = await threads.list_threads({
      user_public_key: query_user_public_key,
      thread_state,
      limit,
      offset,
      requesting_user_public_key
    })

    res.json(thread_list)
  } catch (error) {
    handle_errors(res, error, 'listing threads')
  }
})

// Get a specific thread
router.get('/:thread_id', check_thread_permission(), async (req, res) => {
  try {
    log(`Getting thread ${req.params.thread_id}`)
    const { thread_id } = req.params

    const user_public_key =
      req.user?.user_public_key ||
      req.permission_context?.user_public_key ||
      null
    const thread = await threads.get_thread({
      thread_id,
      user_public_key
    })

    log(`Thread retrieved successfully: ${thread.thread_id}`)
    res.json(thread)
  } catch (error) {
    log(`Error getting thread: ${error.message}`)
    if (error.message.includes('Thread not found')) {
      return res.status(404).json({ error: 'Thread not found' })
    }
    handle_errors(res, error, 'getting thread')
  }
})

// Update thread state
router.put('/:thread_id/state', check_thread_permission(), async (req, res) => {
  try {
    const { thread_id } = req.params
    const { thread_state, reason, archive_reason } = req.body

    if (!thread_state) {
      return res.status(400).json({ error: 'thread_state is required' })
    }

    // Check if user has permission to modify this thread
    if (req.requires_redaction) {
      log(`Access denied: User cannot modify thread ${thread_id}`)
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only modify threads that you own'
      })
    }

    // Use archive_reason if provided, otherwise fall back to reason for backward compatibility
    const state_reason = archive_reason || reason

    // Update thread state
    const updated_thread = await threads.update_thread_state({
      thread_id,
      thread_state,
      reason: state_reason
    })

    res.json(updated_thread)
  } catch (error) {
    handle_errors(res, error, 'updating thread state')
  }
})

// Process table request for server-side filtering, sorting, and pagination
router.post('/table', async (req, res) => {
  try {
    const { table_state } = req.body

    // Validate table state against react-table schema
    if (table_state && typeof table_state !== 'object') {
      return res.status(400).json({
        error: 'Invalid table_state',
        message: 'table_state must be an object matching react-table schema'
      })
    }

    // Use requesting user's permissions for filtering
    const requesting_user_public_key =
      req.user?.user_public_key ||
      req.permission_context?.user_public_key ||
      null

    // Process the table request with server-side filtering and sorting
    const result = await process_table_request({
      table_state,
      requesting_user_public_key
    })

    res.json(result)
  } catch (error) {
    handle_errors(res, error, 'processing table request')
  }
})

export default router
