import express from 'express'
import debug from 'debug'

import * as threads from '#libs-server/threads/index.mjs'
import { get_active_session_for_thread } from '#libs-server/active-sessions/index.mjs'
import { process_thread_table_request } from '#libs-server/threads/process-thread-table-request.mjs'
import {
  check_thread_permission_middleware,
  check_thread_permission,
  check_thread_permission_for_user,
  check_create_threads_permission,
  check_permissions_batch
} from '#server/middleware/permission/index.mjs'
import { redact_thread_data } from '#server/middleware/content-redactor.mjs'
import validate_working_directory from '#libs-server/threads/validate-working-directory.mjs'
import { add_thread_creation_job } from '#libs-server/threads/job-queue.mjs'
import { get_user_base_directory } from '#libs-server/base-uri/index.mjs'
import { thread_constants } from '#libs-shared'
import {
  enrich_thread_with_timeline,
  get_latest_timeline_events_batch
} from '#libs-server/threads/thread-utils.mjs'
import { get_cached_threads } from '#server/services/cache-warmer.mjs'
import embedded_index_manager from '#libs-server/embedded-database-index/embedded-index-manager.mjs'
import { query_threads_from_duckdb } from '#libs-server/embedded-database-index/duckdb/duckdb-table-queries.mjs'
import { get_models_from_cache } from '#libs-server/utils/models-cache.mjs'
import { calculate_thread_cost } from '#libs-server/utils/thread-cost-calculator.mjs'

const router = express.Router()
const log = debug('api:threads')

// HTTP cache headers for public requests
const HTTP_MAX_AGE = 5 * 60
const HTTP_STALE_WHILE_REVALIDATE = 4 * 60 * 60

/**
 * Helper functions
 */

async function apply_permission_based_redaction(thread, user_public_key) {
  const permission_result = await check_thread_permission({
    user_public_key,
    thread_id: thread.thread_id
  })

  if (!permission_result.read?.allowed) {
    log(
      `Access denied to thread ${thread.thread_id}: ${permission_result.read?.reason}`
    )
    return { ...redact_thread_data(thread), can_write: false }
  }

  const can_write = permission_result.write?.allowed ?? false
  return { ...thread, can_write }
}

function handle_errors(res, error, operation) {
  log(`Error ${operation}: ${error.message}`)
  res.status(500).json({
    error: `Failed to ${operation}`,
    message: error.message
  })
}

/**
 * Handles validation errors for thread state updates
 * Returns 400 status for validation errors, otherwise re-throws
 */
function handle_validation_error(error) {
  if (
    error.message.includes('Invalid archive reason') ||
    error.message.includes('archive_reason is required')
  ) {
    return {
      handled: true,
      status: 400,
      response: {
        error: error.message,
        message: error.message
      }
    }
  }
  return { handled: false }
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
 * Normalize DuckDB thread to API response format
 */
function normalize_duckdb_thread_for_response(thread, models_data) {
  const { total_cost, input_cost, output_cost, currency } =
    calculate_thread_cost(thread, models_data)

  return {
    thread_id: thread.thread_id,
    title: thread.title,
    short_description: thread.short_description,
    thread_state: thread.thread_state || 'unknown',
    created_at: thread.created_at,
    updated_at: thread.updated_at,
    duration_minutes: thread.duration_minutes || 0,
    user_public_key: thread.user_public_key,
    session_provider: thread.session_provider || 'base',
    inference_provider: thread.inference_provider,
    primary_model: thread.primary_model,
    working_directory: thread.working_directory,
    working_directory_path: thread.working_directory_path,
    message_count: thread.message_count || 0,
    user_message_count: thread.user_message_count || 0,
    assistant_message_count: thread.assistant_message_count || 0,
    tool_call_count: thread.tool_call_count || 0,
    total_tokens: thread.total_tokens || 0,
    total_input_tokens: thread.total_input_tokens || 0,
    total_output_tokens: thread.total_output_tokens || 0,
    cache_creation_input_tokens: thread.cache_creation_input_tokens || 0,
    cache_read_input_tokens: thread.cache_read_input_tokens || 0,
    total_cost,
    input_cost,
    output_cost,
    currency,
    description: thread.description || '',
    tags: thread.tags || [],
    // Note: latest_timeline_event not available from DuckDB (would require separate query)
    latest_timeline_event: null
  }
}

/**
 * Handle thread list request using DuckDB index
 */
async function handle_thread_list_request_indexed({
  thread_state,
  limit,
  offset,
  requesting_user_key
}) {
  // Build filters
  const filters = []
  if (thread_state) {
    filters.push({
      column_id: 'thread_state',
      operator: '=',
      value: thread_state
    })
  }

  // Fetch models data for cost calculation
  let models_data = null
  try {
    const cache_data = await get_models_from_cache()
    models_data = cache_data?.models || null
  } catch (error) {
    log('Failed to fetch models data for cost calculation: %s', error.message)
  }

  // Query from DuckDB
  const duckdb_threads = await query_threads_from_duckdb({
    filters,
    sort: [{ column_id: 'created_at', desc: true }],
    limit,
    offset
  })

  // Normalize to API format
  const normalized_threads = duckdb_threads.map((thread) =>
    normalize_duckdb_thread_for_response(thread, models_data)
  )

  // Batch permission check for all threads using base URIs
  const resource_paths = normalized_threads.map(
    (thread) => `user:thread/${thread.thread_id}`
  )
  let permissions = {}
  if (resource_paths.length > 0) {
    try {
      permissions = await check_permissions_batch({
        user_public_key: requesting_user_key,
        resource_paths
      })
    } catch (error) {
      log(
        `Error batch checking thread permissions (applying default deny): ${error.message}`
      )
    }
  }

  // Apply redaction based on batch permission results and add can_write
  const threads_with_permissions = normalized_threads.map((thread) => {
    const base_uri = `user:thread/${thread.thread_id}`
    const read_allowed = permissions[base_uri]?.read?.allowed ?? false
    const can_write = permissions[base_uri]?.write?.allowed ?? false
    if (!read_allowed) {
      return { ...redact_thread_data(thread), can_write: false }
    }
    return { ...thread, can_write }
  })

  return threads_with_permissions
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
    const requesting_user_key = req.user?.user_public_key || null
    const include_timeline = req.query.include_timeline !== 'false'

    // For public (unauthenticated) requests with default pagination, use caching
    const is_public_request = !requesting_user_key
    const is_cacheable =
      is_public_request && limit === 1000 && offset === 0 && include_timeline

    // Set HTTP cache headers based on authentication status
    // Use Vary: Authorization to ensure browsers cache authenticated and
    // unauthenticated responses separately, preventing stale redacted data
    // from being served after login
    res.set('Vary', 'Authorization')

    if (is_public_request) {
      res.set(
        'Cache-Control',
        `public, max-age=${HTTP_MAX_AGE}, stale-while-revalidate=${HTTP_STALE_WHILE_REVALIDATE}`
      )
    } else {
      // Authenticated requests should not be cached by shared caches
      // and browsers should revalidate on each request
      res.set('Cache-Control', 'private, no-cache')
    }

    // Check centralized cache (maintained by cache-warmer service)
    if (is_cacheable) {
      const cached_data = get_cached_threads({ thread_state })
      if (cached_data) {
        log(`Returning cached threads list for state=${thread_state || 'all'}`)
        // Apply permission-based redaction (public users see redacted data)
        const threads_with_permissions = await Promise.all(
          cached_data.map((thread) =>
            apply_permission_based_redaction(thread, requesting_user_key)
          )
        )
        return res.json(threads_with_permissions)
      }
    }

    // For authenticated requests, try DuckDB first for better performance
    if (requesting_user_key && embedded_index_manager.is_duckdb_ready()) {
      try {
        log('Using DuckDB index for authenticated thread query')
        const result = await handle_thread_list_request_indexed({
          thread_state,
          limit,
          offset,
          requesting_user_key
        })
        return res.json(result)
      } catch (error) {
        log(
          'DuckDB query failed, falling back to filesystem: %s',
          error.message
        )
      }
    }

    // Fallback: Cache miss or filtered request - fetch fresh data from filesystem
    log('Fetching threads from filesystem')

    // Get all threads from filesystem
    const all_threads = await threads.list_threads({
      user_public_key,
      thread_state,
      limit,
      offset
    })

    // Enrich threads with latest timeline event (for homepage display)
    const enriched_threads = include_timeline
      ? await Promise.all(
          all_threads.map((thread) => enrich_thread_with_timeline({ thread }))
        )
      : all_threads

    // Apply permission checking and redaction to each thread
    const threads_with_permissions = await Promise.all(
      enriched_threads.map((thread) =>
        apply_permission_based_redaction(thread, requesting_user_key)
      )
    )

    res.json(threads_with_permissions)
  } catch (error) {
    handle_errors(res, error, 'listing threads')
  }
})

// Get latest timeline events for multiple threads (batch endpoint)
router.get('/latest-events', async (req, res) => {
  try {
    const { ids } = req.query
    const requesting_user_key = req.user?.user_public_key || null

    // Validate ids parameter
    if (!ids || typeof ids !== 'string') {
      return res.status(400).json({
        error: 'Missing ids parameter',
        message: 'ids query parameter is required (comma-separated thread IDs)'
      })
    }

    // Parse and validate thread IDs
    const thread_ids = ids
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0)

    if (thread_ids.length === 0) {
      return res.status(400).json({
        error: 'Invalid ids parameter',
        message: 'At least one valid thread ID is required'
      })
    }

    // Enforce max limit to prevent abuse
    const MAX_THREAD_IDS = 100
    if (thread_ids.length > MAX_THREAD_IDS) {
      return res.status(400).json({
        error: 'Too many thread IDs',
        message: `Maximum ${MAX_THREAD_IDS} thread IDs allowed per request`
      })
    }

    log(`Fetching latest events for ${thread_ids.length} threads`)

    // Check permissions first to avoid expensive file reads for unauthorized threads
    const resource_paths = thread_ids.map((id) => `user:thread/${id}`)
    let permissions = {}
    try {
      permissions = await check_permissions_batch({
        user_public_key: requesting_user_key,
        resource_paths
      })
    } catch (error) {
      log(
        `Error batch checking thread permissions (applying default deny): ${error.message}`
      )
    }

    // Filter to only authorized thread IDs
    const authorized_thread_ids = thread_ids.filter((id) => {
      const base_uri = `user:thread/${id}`
      return permissions[base_uri]?.read?.allowed ?? false
    })

    // Fetch latest events only for authorized threads
    const events_map =
      authorized_thread_ids.length > 0
        ? await get_latest_timeline_events_batch({
            thread_ids: authorized_thread_ids
          })
        : {}

    // Build result: authorized threads get their events, others get null
    const result = {}
    for (const thread_id of thread_ids) {
      if (authorized_thread_ids.includes(thread_id)) {
        result[thread_id] = events_map[thread_id] || null
      } else {
        // Return null for threads user cannot access
        result[thread_id] = null
      }
    }

    res.json(result)
  } catch (error) {
    handle_errors(res, error, 'fetching latest timeline events')
  }
})

// Get a specific thread
router.get('/:thread_id', async (req, res) => {
  try {
    const { thread_id } = req.params
    log(`Getting thread ${thread_id}`)

    const requesting_user_key = req.user?.user_public_key || null
    const is_public_request = !requesting_user_key

    // Set HTTP cache headers based on authentication status
    res.set('Vary', 'Authorization')
    if (is_public_request) {
      res.set(
        'Cache-Control',
        `public, max-age=${HTTP_MAX_AGE}, stale-while-revalidate=${HTTP_STALE_WHILE_REVALIDATE}`
      )
    } else {
      res.set('Cache-Control', 'private, no-cache')
    }

    // Pass user_public_key to get_thread so it can do proper permission checking
    const response_thread = await threads.get_thread({
      thread_id,
      user_public_key: requesting_user_key
    })

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

// Get active session for a thread
router.get('/:thread_id/active-session', async (req, res) => {
  try {
    const { thread_id } = req.params
    log(`Getting active session for thread ${thread_id}`)

    const session = await get_active_session_for_thread(thread_id)

    if (!session) {
      return res.status(404).json({
        error: 'No active session',
        message: `No active session found for thread ${thread_id}`
      })
    }

    res.json(session)
  } catch (error) {
    handle_errors(res, error, 'getting active session for thread')
  }
})

// Update thread state
router.put(
  '/:thread_id/state',
  check_thread_permission_middleware(),
  async (req, res) => {
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

      // Validate archive_reason requirement when archiving
      if (thread_state === thread_constants.THREAD_STATE.ARCHIVED) {
        // Use archive_reason if provided, otherwise fall back to reason for backward compatibility
        const state_reason = archive_reason || reason
        if (!state_reason) {
          const valid_reasons = Object.values(
            thread_constants.ARCHIVE_REASON
          ).join(', ')
          return res.status(400).json({
            error: 'archive_reason is required',
            message: `archive_reason is required when archiving a thread. Must be one of: ${valid_reasons}`
          })
        }
        try {
          const updated_thread = await threads.update_thread_state({
            thread_id,
            thread_state,
            reason: state_reason
          })
          return res.json(updated_thread)
        } catch (error) {
          const validation_error = handle_validation_error(error)
          if (validation_error.handled) {
            return res
              .status(validation_error.status)
              .json(validation_error.response)
          }
          throw error
        }
      }

      // For non-archived states, reason is optional
      try {
        const updated_thread = await threads.update_thread_state({
          thread_id,
          thread_state,
          reason: reason || undefined
        })
        return res.json(updated_thread)
      } catch (error) {
        const validation_error = handle_validation_error(error)
        if (validation_error.handled) {
          return res
            .status(validation_error.status)
            .json(validation_error.response)
        }
        throw error
      }
    } catch (error) {
      handle_errors(res, error, 'updating thread state')
    }
  }
)

// Process table request for server-side filtering, sorting, and pagination
router.post('/table', async (req, res) => {
  try {
    const { table_state } = req.body
    const requesting_user_key = req.user?.user_public_key || null

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

// Create new thread with Claude CLI session
router.post('/create-session', async (req, res) => {
  try {
    const { prompt, working_directory } = req.body
    const user_public_key = req.user?.user_public_key || null

    // Require authentication
    if (!user_public_key) {
      log('Thread creation attempted without authentication')
      return res.status(401).json({
        error: 'Authentication required',
        message: 'You must be logged in to create threads'
      })
    }

    // Check create_threads permission
    const can_create = await check_create_threads_permission(user_public_key)
    if (!can_create) {
      log(
        `Thread creation denied for user ${user_public_key}: missing create_threads permission`
      )
      return res.status(403).json({
        error: 'Access denied',
        message:
          'You do not have permission to create threads. Contact administrator to enable create_threads permission.'
      })
    }

    // Validate required parameters
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return res.status(400).json({
        error: 'Invalid prompt',
        message: 'Prompt is required and must be a non-empty string'
      })
    }

    if (!working_directory) {
      return res.status(400).json({
        error: 'Invalid working_directory',
        message: 'working_directory is required'
      })
    }

    // Validate working directory
    const user_base_directory = get_user_base_directory()
    let validated_working_directory
    try {
      validated_working_directory = await validate_working_directory({
        working_directory,
        user_base_directory
      })
    } catch (validation_error) {
      log(`Working directory validation failed: ${validation_error.message}`)
      return res.status(400).json({
        error: 'Invalid working directory',
        message: validation_error.message
      })
    }

    log(
      `Queuing Claude CLI session for user ${user_public_key} with prompt length ${prompt.length} in ${validated_working_directory}`
    )

    // Add job to queue - thread will be created by hook after session completes
    const job = await add_thread_creation_job({
      prompt,
      working_directory: validated_working_directory,
      user_public_key
    })

    log(`Job queued: ${job.id} (position ${job.queue_position || 'unknown'})`)

    // Return job information
    // Note: thread_id will be available after the session completes and hook creates the thread
    res.json({
      job_id: job.id,
      queue_position: job.queue_position,
      status: 'queued',
      message:
        'Claude CLI session queued. Thread will be created after session completes.'
    })
  } catch (error) {
    log(`Error creating thread session: ${error.message}`)
    log(error.stack)

    if (
      error.message.includes('required') ||
      error.message.includes('invalid')
    ) {
      return res.status(400).json({
        error: 'Invalid request',
        message: error.message
      })
    }

    handle_errors(res, error, 'creating thread session')
  }
})

// Resume existing Claude session with new message
router.post('/:thread_id/resume', async (req, res) => {
  try {
    const { thread_id } = req.params
    const { prompt, working_directory } = req.body
    const user_public_key = req.user?.user_public_key || null

    // Require authentication
    if (!user_public_key) {
      log('Thread resume attempted without authentication')
      return res.status(401).json({
        error: 'Authentication required',
        message: 'You must be logged in to resume threads'
      })
    }

    // Fetch thread to get Claude session ID
    const thread = await threads.get_thread({ thread_id })
    if (!thread) {
      log(`Thread ${thread_id} not found`)
      return res.status(404).json({
        error: 'Thread not found',
        message: `Thread ${thread_id} does not exist`
      })
    }

    // Check permissions for this thread
    const permission_result = await check_thread_permission_for_user({
      user_public_key,
      thread_id
    })

    if (!permission_result.allowed) {
      log(
        `User ${user_public_key} does not have permission to resume thread ${thread_id}`
      )
      return res.status(403).json({
        error: 'Permission denied',
        message: 'You do not have permission to resume this thread'
      })
    }

    // Extract Claude session ID from thread metadata
    const claude_session_id = thread.external_session?.session_id
    if (!claude_session_id) {
      log(`Thread ${thread_id} does not have an external Claude session ID`)
      return res.status(400).json({
        error: 'Invalid thread',
        message: 'Thread does not have an associated Claude session to resume'
      })
    }

    log(`Resuming Claude session ${claude_session_id} for thread ${thread_id}`)

    // Validate required parameters
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return res.status(400).json({
        error: 'Invalid prompt',
        message: 'Prompt is required and must be a non-empty string'
      })
    }

    if (!working_directory) {
      return res.status(400).json({
        error: 'Invalid working_directory',
        message: 'working_directory is required'
      })
    }

    // Validate working directory
    const user_base_directory = get_user_base_directory()
    let validated_working_directory
    try {
      validated_working_directory = await validate_working_directory({
        working_directory,
        user_base_directory
      })
    } catch (validation_error) {
      log(`Working directory validation failed: ${validation_error.message}`)
      return res.status(400).json({
        error: 'Invalid working directory',
        message: validation_error.message
      })
    }

    log(
      `Queuing Claude CLI session resume for thread ${thread_id} (Claude session: ${claude_session_id}) by user ${user_public_key} with prompt length ${prompt.length}`
    )

    // Add job to queue - thread will be updated by hook after session completes
    // Pass the Claude session ID so the CLI can resume the correct session
    const job = await add_thread_creation_job({
      prompt,
      working_directory: validated_working_directory,
      user_public_key,
      session_id: claude_session_id // Pass Claude session ID for resume
    })

    log(
      `Resume job queued: ${job.id} for thread ${thread_id} (Claude session: ${claude_session_id})`
    )

    // Return job information
    res.json({
      job_id: job.id,
      thread_id,
      claude_session_id,
      queue_position: job.queue_position,
      status: 'queued',
      message:
        'Claude CLI session queued for resume. Thread will be updated after session completes.'
    })
  } catch (error) {
    log(`Error resuming thread session: ${error.message}`)
    log(error.stack)

    if (
      error.message.includes('required') ||
      error.message.includes('invalid')
    ) {
      return res.status(400).json({
        error: 'Invalid request',
        message: error.message
      })
    }

    handle_errors(res, error, 'resuming thread session')
  }
})

export default router
