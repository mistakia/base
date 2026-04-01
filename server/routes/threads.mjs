import express from 'express'
import debug from 'debug'

import config from '#config'
import {
  HTTP_MAX_AGE,
  HTTP_STALE_WHILE_REVALIDATE
} from '#server/constants/http-cache.mjs'
import { evict_lru_entry } from '#libs-server/utils/lru-cache.mjs'
import * as threads from '#libs-server/threads/index.mjs'
import { process_thread_with_permissions } from '#server/lib/threads/process-thread-with-permissions.mjs'
import { get_active_session_for_thread } from '#server/services/active-sessions/active-session-store.mjs'
import {
  process_thread_table_request,
  normalize_sqlite_thread
} from '#server/lib/threads/process-thread-table-request.mjs'
import {
  check_thread_permission_middleware,
  check_thread_permission,
  check_thread_permission_for_user,
  check_create_threads_permission,
  check_permissions_batch,
  validate_thread_ownership
} from '#server/middleware/permission/index.mjs'
import { redact_thread_data } from '#server/middleware/content-redactor.mjs'
import validate_working_directory from '#libs-server/threads/validate-working-directory.mjs'
import { add_thread_creation_job } from '#server/services/threads/job-queue.mjs'
import { add_cli_job } from '#server/services/cli-queue/queue.mjs'
import { get_user_base_directory } from '#libs-server/base-uri/index.mjs'
import { translate_to_host_path } from '#libs-server/docker/execution-mode.mjs'
import user_registry from '#libs-server/users/user-registry.mjs'
import { get_active_sessions } from '#libs-server/threads/user-container-manager.mjs'
import { get_thread_base_directory } from '#libs-server/threads/threads-constants.mjs'
import { read_timeline_jsonl } from '#libs-server/threads/timeline/index.mjs'
import { thread_constants } from '#libs-shared'
import { enrich_thread_with_timeline } from '#libs-server/threads/thread-utils.mjs'
import embedded_index_manager from '#libs-server/embedded-database-index/embedded-index-manager.mjs'
import { query_threads_from_sqlite } from '#libs-server/embedded-database-index/sqlite/sqlite-table-queries.mjs'
import { find_threads_relating_to } from '#libs-server/embedded-database-index/sqlite/sqlite-relation-queries.mjs'
import { get_models_from_cache } from '#libs-server/utils/models-cache.mjs'
import { handle_errors } from '#libs-server/utils/api-error.mjs'

const router = express.Router()
const log = debug('api:threads')

// Short-lived in-memory cache for individual thread responses.
// Prevents redundant full-timeline reads when the HTML render and API call
// (or rapid browser refreshes) hit the same thread within a short window.
const THREAD_CACHE_TTL_MS = 10 * 1000 // 10 seconds
const THREAD_CACHE_MAX_SIZE = 100
const thread_response_cache = new Map()

function get_cached_thread(cache_key) {
  const entry = thread_response_cache.get(cache_key)
  if (!entry) return null
  if (Date.now() - entry.timestamp > THREAD_CACHE_TTL_MS) {
    thread_response_cache.delete(cache_key)
    return null
  }
  // Update accessed_at for LRU tracking
  entry.accessed_at = Date.now()
  return entry.data
}

function set_cached_thread(cache_key, data) {
  // LRU eviction: remove least recently accessed entry BEFORE adding new one
  // This ensures cache never exceeds max size
  if (thread_response_cache.size >= THREAD_CACHE_MAX_SIZE) {
    evict_lru_entry(thread_response_cache, log)
  }
  const now = Date.now()
  thread_response_cache.set(cache_key, {
    data,
    timestamp: now,
    accessed_at: now
  })
}

/**
 * Invalidate all cached responses for a given thread.
 * Called when thread data is mutated (e.g., timeline entry added).
 * @param {string} thread_id - Thread ID to invalidate
 */
export function invalidate_thread_cache(thread_id) {
  for (const key of thread_response_cache.keys()) {
    if (key.startsWith(`${thread_id}:`)) {
      thread_response_cache.delete(key)
    }
  }
}

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
 * Apply batch permission checking and redaction to a list of threads.
 * Returns threads with can_write flag and redacted data for unauthorized access.
 */
async function apply_batch_permissions_to_threads(
  threads,
  requesting_user_key
) {
  const resource_paths = threads.map(
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

  return threads.map((thread) => {
    const base_uri = `user:thread/${thread.thread_id}`
    const read_allowed = permissions[base_uri]?.read?.allowed ?? false
    const can_write = permissions[base_uri]?.write?.allowed ?? false
    if (!read_allowed) {
      return { ...redact_thread_data(thread), can_write: false }
    }
    return { ...thread, can_write }
  })
}

/**
 * Handle thread list request using SQLite index
 */
async function handle_thread_list_request_indexed({
  thread_state,
  user_public_key,
  search,
  file_ref,
  dir_ref,
  tags,
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
  if (user_public_key) {
    filters.push({
      column_id: 'user_public_key',
      operator: '=',
      value: user_public_key
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

  // Query from SQLite with search, reference, and tag filters
  const sqlite_threads = await query_threads_from_sqlite({
    filters,
    sort: [{ column_id: 'created_at', desc: true }],
    limit,
    offset,
    search,
    file_ref,
    dir_ref,
    tags
  })

  // Normalize to API format
  const normalized_threads = sqlite_threads.map((thread) =>
    normalize_sqlite_thread(thread, models_data)
  )

  // Apply batch permission checking and redaction
  return apply_batch_permissions_to_threads(
    normalized_threads,
    requesting_user_key
  )
}

/**
 * Handle thread list request filtered by relation target using SQLite
 */
async function handle_thread_list_by_relation({
  relates_to,
  relation_type,
  limit,
  offset,
  requesting_user_key
}) {
  // Query threads relating to the target entity
  const thread_results = await find_threads_relating_to({
    base_uri: relates_to,
    relation_type,
    limit,
    offset
  })

  // Normalize thread results to match API format
  const normalized_threads = thread_results.map((thread) => ({
    thread_id: thread.thread_id,
    title: thread.title,
    thread_state: thread.thread_state,
    archived_at: thread.archived_at || null,
    archive_reason: thread.archive_reason || null,
    created_at: thread.created_at,
    updated_at: thread.updated_at,
    relation_type: thread.relation_type,
    relation_context: thread.context
  }))

  // Apply batch permission checking and redaction
  return apply_batch_permissions_to_threads(
    normalized_threads,
    requesting_user_key
  )
}

/**
 * Route handlers
 */

// Get all threads with optional filtering
router.get('/', async (req, res) => {
  try {
    const {
      user_public_key,
      thread_state,
      search,
      file_ref,
      dir_ref,
      relates_to,
      relation_type,
      tags: tags_param
    } = req.query
    // Parse tags parameter: comma-separated string to array, filter empty strings
    const parsed_tags = tags_param
      ?.split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0)
    const tags = parsed_tags?.length > 0 ? parsed_tags : undefined
    const limit = parseInt(req.query.limit) || 50
    const offset = parseInt(req.query.offset) || 0
    const requesting_user_key = req.user?.user_public_key || null
    const include_timeline = req.query.include_timeline === 'true'

    const is_public_request = !requesting_user_key

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

    // Handle relation-based queries (find threads relating to a target entity)
    if (relates_to && embedded_index_manager.is_sqlite_ready()) {
      try {
        log('Using SQLite for thread relation query: relates_to=%s', relates_to)
        const result = await handle_thread_list_by_relation({
          relates_to,
          relation_type,
          limit,
          offset,
          requesting_user_key
        })
        return res.json(result)
      } catch (error) {
        log('SQLite relation query failed: %s', error.message)
        return res.status(500).json({
          error: 'Failed to query thread relations',
          message: error.message
        })
      }
    }

    // Use SQLite for all requests (includes latest_timeline_event from indexed data)
    if (embedded_index_manager.is_sqlite_ready()) {
      try {
        log('Using SQLite index for thread query')
        const result = await handle_thread_list_request_indexed({
          thread_state,
          user_public_key,
          search,
          file_ref,
          dir_ref,
          tags,
          limit,
          offset,
          requesting_user_key
        })
        return res.json(result)
      } catch (error) {
        log(
          'SQLite query failed, falling back to filesystem: %s',
          error.message
        )
      }
    }

    // Fallback: SQLite not available - fetch from filesystem
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

    // Check short-lived cache to avoid redundant timeline reads on rapid reloads
    const cache_key = `${thread_id}:${requesting_user_key || 'public'}`
    const cached = get_cached_thread(cache_key)
    if (cached) {
      log(`Thread ${thread_id} served from cache`)
      return res.json(cached)
    }

    // Parse optional timeline filtering query params
    const take_last = req.query.take_last
      ? parseInt(req.query.take_last, 10)
      : undefined
    const take_first = req.query.take_first
      ? parseInt(req.query.take_first, 10)
      : undefined
    const timeline_limit = req.query.timeline_limit
      ? parseInt(req.query.timeline_limit, 10)
      : undefined
    const timeline_offset = req.query.timeline_offset
      ? parseInt(req.query.timeline_offset, 10)
      : undefined
    const exclude_types = req.query.exclude_types
      ? req.query.exclude_types.split(',').filter(Boolean)
      : []

    // Pass user_public_key and timeline filters to get_thread
    const response_thread = await threads.get_thread({
      thread_id,
      user_public_key: requesting_user_key,
      take_last,
      take_first,
      limit: timeline_limit,
      offset: timeline_offset,
      exclude_types,
      process_thread: process_thread_with_permissions
    })

    set_cached_thread(cache_key, response_thread)

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

// Get a single timeline entry by ID (for on-demand full content fetch)
router.get('/:thread_id/timeline/:entry_id', async (req, res) => {
  try {
    const { thread_id, entry_id } = req.params
    const requesting_user_key = req.user?.user_public_key || null

    log(`Getting timeline entry ${entry_id} for thread ${thread_id}`)

    // Check permission
    const permission_result = await check_thread_permission({
      user_public_key: requesting_user_key,
      thread_id
    })

    if (!permission_result.read?.allowed) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have permission to access this thread'
      })
    }

    // Read the timeline and find the entry
    const thread_base_directory = get_thread_base_directory()
    const timeline_path = `${thread_base_directory}/${thread_id}/timeline.jsonl`
    const timeline = await read_timeline_jsonl({ timeline_path })

    if (!timeline) {
      return res.status(404).json({
        error: 'Timeline not found',
        message: `No timeline found for thread ${thread_id}`
      })
    }

    const entry = timeline.find((e) => e.id === entry_id)

    if (!entry) {
      return res.status(404).json({
        error: 'Entry not found',
        message: `Timeline entry ${entry_id} not found in thread ${thread_id}`
      })
    }

    // Set cache headers - timeline entries are immutable once written
    res.set('Cache-Control', 'private, max-age=3600')
    res.json(entry)
  } catch (error) {
    handle_errors(res, error, 'getting timeline entry')
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
    let execution_mode =
      req.body.execution_mode ||
      config.threads?.cli?.default_execution_mode ||
      'host'
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

    // Load thread_config from user registry
    const thread_config = await user_registry.get_thread_config(user_public_key)
    const user = thread_config
      ? await user_registry.find_by_public_key(user_public_key)
      : null
    const username = user?.username || null

    // If user has thread_config, route to container_user mode
    if (thread_config) {
      execution_mode = 'container_user'
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

    // For container_user mode, check concurrent session limit
    if (execution_mode === 'container_user' && thread_config) {
      const active = await get_active_sessions({ username })
      if (active >= thread_config.max_concurrent_threads) {
        return res.status(429).json({
          error: 'Concurrent session limit reached',
          message: `Maximum ${thread_config.max_concurrent_threads} concurrent sessions allowed. Currently active: ${active}`
        })
      }
    }

    // Normalize container paths to host paths before validation
    const normalized_working_directory =
      execution_mode === 'container' || execution_mode === 'container_user'
        ? translate_to_host_path(working_directory)
        : working_directory

    // Validate working directory -- resolves base URIs (e.g. 'user:') to
    // host filesystem paths and ensures the path is within user-base.
    // Volume mounts and permissions.deny are the security boundary for
    // container_user mode, not the working directory itself.
    const user_base_directory = get_user_base_directory()
    let validated_working_directory
    try {
      validated_working_directory = await validate_working_directory({
        working_directory: normalized_working_directory,
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
      user_public_key,
      execution_mode,
      thread_config,
      username
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
    const { prompt } = req.body
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

    // Determine execution mode from thread metadata or request
    const thread_execution_mode = thread.source?.execution_mode
    const execution_mode =
      thread_execution_mode ||
      req.body.execution_mode ||
      config.threads?.cli?.default_execution_mode ||
      'host'

    // Check if requesting user is a container_user (has thread_config)
    const requesting_user_thread_config =
      await user_registry.get_thread_config(user_public_key)
    const is_container_user = requesting_user_thread_config !== null

    // For container_user threads, enforce ownership
    if (execution_mode === 'container_user') {
      const is_owner = await validate_thread_ownership({
        user_public_key,
        thread_id
      })
      if (!is_owner) {
        log(
          `User ${user_public_key} is not the owner of container_user thread ${thread_id}`
        )
        return res.status(403).json({
          error: 'Permission denied',
          message: 'You can only resume threads that you created'
        })
      }
    } else if (is_container_user) {
      // Container users can only resume their own container_user threads,
      // not host/container threads created by other users (e.g., admin)
      log(
        `Container user ${user_public_key} attempted to resume non-container_user thread ${thread_id}`
      )
      return res.status(403).json({
        error: 'Permission denied',
        message: 'You can only resume threads that you created'
      })
    } else {
      // For host/container threads from non-container users, use existing read permission check
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
    }

    // Use already-loaded thread_config for container_user mode
    let thread_config = null
    let username = null
    if (execution_mode === 'container_user') {
      thread_config = requesting_user_thread_config
      const user = thread_config
        ? await user_registry.find_by_public_key(user_public_key)
        : null
      username = user?.username || null
    }

    // Extract Claude session ID from thread metadata
    const claude_session_id = thread.source?.session_id
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

    // Use provided working_directory or fall back to thread's stored directory
    const working_directory =
      req.body.working_directory ||
      thread.source?.provider_metadata?.working_directory
    if (!working_directory) {
      return res.status(400).json({
        error: 'Invalid working_directory',
        message:
          'working_directory is required and could not be inferred from thread metadata'
      })
    }

    // Normalize container paths to host paths before validation
    const normalized_working_directory =
      execution_mode === 'container' || execution_mode === 'container_user'
        ? translate_to_host_path(working_directory)
        : working_directory

    // Validate working directory -- resolves base URIs and ensures path
    // is within user-base bounds for all execution modes
    const user_base_directory = get_user_base_directory()
    let validated_working_directory
    try {
      validated_working_directory = await validate_working_directory({
        working_directory: normalized_working_directory,
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
    const job = await add_thread_creation_job({
      prompt,
      working_directory: validated_working_directory,
      user_public_key,
      session_id: claude_session_id,
      thread_id,
      execution_mode,
      thread_config,
      username
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

// Rate-limit map for sync-user-session: transcript_path -> last_sync_timestamp
const sync_rate_limit = new Map()
const SYNC_RATE_LIMIT_MS = 5000

// Sync user session from container hooks
router.post('/sync-user-session', async (req, res) => {
  try {
    const { username, transcript_path, hook_event_name, user_public_key } =
      req.body

    if (!username || !transcript_path || !user_public_key) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'username, transcript_path, and user_public_key are required'
      })
    }

    // Validate user_public_key matches the username
    const user = await user_registry.find_by_public_key(user_public_key)
    if (!user || user.username !== username) {
      log(
        `sync-user-session: user_public_key does not match username ${username}`
      )
      return res.status(403).json({
        error: 'Access denied',
        message: 'user_public_key does not match username'
      })
    }

    // Rate limit: skip if same transcript_path was synced within SYNC_RATE_LIMIT_MS
    const last_sync = sync_rate_limit.get(transcript_path)
    if (last_sync && Date.now() - last_sync < SYNC_RATE_LIMIT_MS) {
      log(
        `sync-user-session: rate limited for ${transcript_path} (${hook_event_name})`
      )
      return res.json({ status: 'skipped', reason: 'rate_limited' })
    }
    sync_rate_limit.set(transcript_path, Date.now())

    // Translate container-internal path to host path
    // Container path: /home/node/.claude/projects/...
    // Host path: <user_data_dir>/<username>/claude-home/projects/...
    const { get_user_container_claude_home } = await import(
      '#libs-server/threads/user-container-manager.mjs'
    )
    const container_prefix = '/home/node/.claude'
    if (!transcript_path.startsWith(container_prefix)) {
      return res.status(400).json({
        error: 'Invalid transcript_path',
        message: `transcript_path must start with ${container_prefix}`
      })
    }
    const relative_path = transcript_path.slice(container_prefix.length)
    const host_path =
      get_user_container_claude_home({ username }) + relative_path

    // Verify the host-path file exists
    const { access } = await import('fs/promises')
    try {
      await access(host_path)
    } catch {
      log(`sync-user-session: file not found at ${host_path}`)
      return res.status(404).json({
        error: 'File not found',
        message: 'Transcript file not found on host'
      })
    }

    log(
      `sync-user-session: importing ${host_path} for ${username} (${hook_event_name})`
    )

    const { create_threads_from_session_provider } = await import(
      '#libs-server/integrations/thread/create-threads-from-session-provider.mjs'
    )
    const result = await create_threads_from_session_provider({
      provider_name: 'claude',
      allow_updates: true,
      provider_options: {
        session_file: host_path
      },
      user_public_key,
      source_overrides: {
        execution_mode: 'container_user',
        container_user: true,
        container_name: `base-user-${username}`
      }
    })

    const thread_id =
      result.created?.[0]?.thread_id || result.updated?.[0]?.thread_id || null
    const status = result.created?.length ? 'created' : 'updated'

    // On SessionEnd: queue push-threads and auto-commit
    if (hook_event_name === 'SessionEnd') {
      try {
        if (thread_id) {
          await add_cli_job({
            command: `$USER_BASE_DIRECTORY/repository/active/base/cli/auto-commit-threads.sh ${thread_id}`,
            tags: ['thread-sync'],
            priority: 5,
            timeout_ms: 60000
          })
        }
        await add_cli_job({
          command:
            '$USER_BASE_DIRECTORY/repository/active/base/cli/push-threads.sh',
          tags: ['thread-sync'],
          priority: 5,
          timeout_ms: 120000
        })
        log(`sync-user-session: queued post-session jobs for ${username}`)
      } catch (queue_error) {
        log(
          `sync-user-session: failed to queue post-session jobs - ${queue_error.message}`
        )
      }

      // Clean up rate limit entry on session end
      sync_rate_limit.delete(transcript_path)
    }

    log(`sync-user-session: ${status} thread ${thread_id} for ${username}`)

    res.json({ thread_id, status })
  } catch (error) {
    handle_errors(res, error, 'syncing user session')
  }
})

export default router
