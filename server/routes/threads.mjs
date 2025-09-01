import express from 'express'
import debug from 'debug'

import * as threads from '#libs-server/threads/index.mjs'
import { check_thread_permission } from '#server/middleware/permissions.mjs'
import { process_thread_table_request } from '#libs-server/threads/process-thread-table-request.mjs'
import { check_user_permission } from '#server/middleware/permission-checker.mjs'
import { redact_thread_data } from '#server/middleware/content-redactor.mjs'

const router = express.Router()
const log = debug('api:threads')

/**
 * Helper functions
 */

function get_requesting_user_key(req) {
  return (
    req.user?.user_public_key || req.permission_context?.user_public_key || null
  )
}

function build_thread_resource_path(thread_id) {
  return `user:thread/${thread_id}`
}

async function check_thread_access_permission(user_public_key, thread_id) {
  if (!user_public_key) return false

  const thread_resource_path = build_thread_resource_path(thread_id)
  const permission_result = await check_user_permission({
    user_public_key,
    resource_path: thread_resource_path
  })

  return permission_result.allowed
}

async function apply_permission_based_redaction(thread, user_public_key) {
  const has_permission = await check_thread_access_permission(
    user_public_key,
    thread.thread_id
  )

  if (!has_permission) {
    return redact_thread_data(thread)
  }

  return thread
}

function handle_errors(res, error, operation) {
  log(`Error ${operation}: ${error.message}`)
  res.status(500).json({
    error: `Failed to ${operation}`,
    message: error.message
  })
}

function validate_table_state(table_state) {
  if (table_state && typeof table_state !== 'object') {
    return {
      valid: false,
      error: 'table_state must be an object matching react-table schema'
    }
  }
  return { valid: true }
}

/**
 * Route handlers
 */

// Get all threads with optional filtering
router.get('/', async (req, res) => {
  try {
    const { user_public_key, thread_state } = req.query
    const limit = parseInt(req.query.limit) || 1000
    const offset = parseInt(req.query.offset) || 0
    const requesting_user_key = get_requesting_user_key(req)

    // Get all threads from filesystem
    const all_threads = await threads.list_threads({
      user_public_key,
      thread_state,
      limit,
      offset
    })

    // Apply permission checking and redaction to each thread
    const threads_with_permissions = await Promise.all(
      all_threads.map((thread) =>
        apply_permission_based_redaction(thread, requesting_user_key)
      )
    )

    res.json(threads_with_permissions)
  } catch (error) {
    handle_errors(res, error, 'listing threads')
  }
})

// Get a specific thread
router.get('/:thread_id', async (req, res) => {
  try {
    const { thread_id } = req.params
    log(`Getting thread ${thread_id}`)

    const requesting_user_key = get_requesting_user_key(req)
    const thread = await threads.get_thread({ thread_id })

    // Apply permission-based redaction
    const response_thread = await apply_permission_based_redaction(
      thread,
      requesting_user_key
    )

    log(`Thread retrieved successfully: ${thread_id}`)
    res.json(response_thread)
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
    if (!req.access?.write_allowed) {
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
    const requesting_user_key = get_requesting_user_key(req)

    // Validate table state
    const validation = validate_table_state(table_state)
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Invalid table_state',
        message: validation.error
      })
    }

    // Process the table request with server-side filtering and sorting
    const result = await process_thread_table_request({
      table_state,
      requesting_user_public_key: requesting_user_key
    })

    res.json(result)
  } catch (error) {
    handle_errors(res, error, 'processing table request')
  }
})

export default router
