import express from 'express'
import path from 'path'
import debug from 'debug'
import { safe_error_message } from '#server/utils/error-response.mjs'

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
import crypto from 'crypto'
import { add_thread_creation_job } from '#server/services/threads/job-queue.mjs'
import create_thread from '#libs-server/threads/create-thread.mjs'
import { generate_default_thread_title_from_prompt } from '#libs-server/integrations/thread/session-count-utilities.mjs'
import { emit_thread_updated } from '#server/services/threads/event-emitter.mjs'
import require_hook_auth from '#server/middleware/hook-auth.mjs'
import patch_thread_metadata from '#libs-server/threads/patch-thread-metadata.mjs'
import { add_cli_job } from '#server/services/cli-queue/queue.mjs'
import {
  get_user_base_directory,
  is_valid_base_uri,
  create_base_uri_from_path
} from '#libs-server/base-uri/index.mjs'
import {
  is_per_user_container,
  build_execution_attribution
} from '#libs-server/threads/execution-attribution.mjs'
import user_registry from '#libs-server/users/user-registry.mjs'
import { get_active_sessions } from '#libs-server/threads/user-container-manager.mjs'
import { get_thread_base_directory } from '#libs-server/threads/threads-constants.mjs'
import { read_timeline_jsonl } from '#libs-server/threads/timeline/index.mjs'
import { thread_constants } from '#libs-shared'
import embedded_index_manager from '#libs-server/embedded-database-index/embedded-index-manager.mjs'
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
        message: safe_error_message(error)
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
 * Handle thread list request via the embedded index manager.
 * The manager delegates to the active backend and falls back to filesystem
 * when the index is unavailable.
 */
async function handle_thread_list_request({
  thread_state,
  user_public_key,
  search,
  file_ref,
  dir_ref,
  tags,
  without_tags,
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

  // Query via manager (handles backend delegation and fallback)
  const result_threads = await embedded_index_manager.query_threads({
    filters,
    sort: [{ column_id: 'created_at', desc: true }],
    limit,
    offset,
    search,
    file_ref,
    dir_ref,
    tags,
    without_tags
  })

  // Normalize to API format (in fallback mode, filesystem objects lack token
  // counts and cost data -- normalize_sqlite_thread coerces these to null/0)
  const normalized_threads = result_threads.map((thread) =>
    normalize_sqlite_thread(thread, models_data)
  )

  // Apply batch permission checking and redaction
  return apply_batch_permissions_to_threads(
    normalized_threads,
    requesting_user_key
  )
}

/**
 * Handle thread list request filtered by relation target.
 * Requires the index to be available (no filesystem fallback for relations).
 */
async function handle_thread_list_by_relation({
  relates_to,
  relation_type,
  thread_state,
  limit,
  offset,
  requesting_user_key
}) {
  const thread_results = await embedded_index_manager.find_threads_relating_to({
    base_uri: relates_to,
    relation_type,
    thread_state,
    limit,
    offset
  })

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
      tags: tags_param,
      without_tags: without_tags_param
    } = req.query
    // Parse tags parameter: comma-separated string to array, filter empty strings
    const parsed_tags = tags_param
      ?.split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0)
    const tags = parsed_tags?.length > 0 ? parsed_tags : undefined
    const without_tags = without_tags_param === 'true'
    const limit = parseInt(req.query.limit) || 50
    const offset = parseInt(req.query.offset) || 0
    const requesting_user_key = req.user?.user_public_key || null

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

    // Handle relation-based queries (requires index)
    if (relates_to) {
      if (!embedded_index_manager.is_ready()) {
        return res
          .status(503)
          .json({ error: 'Index not available for relation queries' })
      }
      try {
        const result = await handle_thread_list_by_relation({
          relates_to,
          relation_type,
          thread_state,
          limit,
          offset,
          requesting_user_key
        })
        return res.json(result)
      } catch (error) {
        log('Thread relation query failed: %s', error.message)
        return res.status(500).json({
          error: 'Failed to query thread relations',
          message: safe_error_message(error)
        })
      }
    }

    // Query threads via manager (handles backend delegation and fallback)
    const result = await handle_thread_list_request({
      thread_state,
      user_public_key,
      search,
      file_ref,
      dir_ref,
      tags,
      without_tags,
      limit,
      offset,
      requesting_user_key
    })

    res.json(result)
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

    // Fast-fail with a 400 for invalid base URIs. The job worker re-runs
    // validate_working_directory for the authoritative resolve; we forward
    // the original URI so the worker's resolver is the single source of
    // truth for URI -> host path translation.
    try {
      await validate_working_directory({
        working_directory,
        user_base_directory: get_user_base_directory()
      })
    } catch (validation_error) {
      log(`Working directory validation failed: ${validation_error.message}`)
      return res.status(400).json({
        error: 'Invalid working directory',
        message: validation_error.message
      })
    }

    log(
      `Queuing Claude CLI session for user ${user_public_key} with prompt length ${prompt.length} in ${working_directory}`
    )

    // Generate IDs upfront for thread-first flow
    const thread_id = crypto.randomUUID()
    const job_id = crypto.randomUUID()

    // Build canonical execution attribution at creation time so resume and
    // dispatch reads have a stamp from session zero rather than waiting on
    // a post-session sync hook to backfill it.
    const create_execution =
      execution_mode === 'container_user'
        ? build_execution_attribution({ mode: 'container', username })
        : execution_mode === 'container'
          ? build_execution_attribution({
              mode: 'container',
              container_name: 'base-container'
            })
          : build_execution_attribution({ mode: 'host' })

    // The claude sync hook is the sole writer of the initial user entry.
    // Writing it here too produced duplicates because server-generated ids
    // and the hook's deterministic ids did not match.
    await create_thread({
      thread_id,
      user_public_key,
      inference_provider: 'anthropic',
      models: [],
      thread_state: 'active',
      title: generate_default_thread_title_from_prompt({ prompt }),
      execution: create_execution,
      additional_metadata: {
        session_status: 'queued',
        prompt_snippet: prompt.slice(0, 200),
        job_id
      }
    })

    // Add job to queue with pre-generated IDs
    const job = await add_thread_creation_job({
      prompt,
      working_directory,
      user_public_key,
      execution_mode,
      thread_config,
      username,
      thread_id,
      job_id
    })

    log(
      `Job queued: ${job.id} for thread ${thread_id} (position ${job.queue_position || 'unknown'})`
    )

    res.json({
      thread_id,
      job_id: job.id,
      queue_position: job.queue_position,
      status: 'queued',
      message: 'Thread created and Claude CLI session queued.'
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
        message: safe_error_message(error)
      })
    }

    handle_errors(res, error, 'creating thread session')
  }
})

// Lightweight session status update endpoint
// Used by hook scripts to report session lifecycle transitions
router.put(
  '/:thread_id/session-status',
  require_hook_auth,
  async (req, res) => {
    try {
      const { session_status, session_id } = req.body
      const { thread_id } = req.params

      if (!session_status) {
        return res.status(400).json({ error: 'session_status is required' })
      }

      const valid_statuses = [
        'queued',
        'starting',
        'active',
        'idle',
        'completed',
        'failed'
      ]
      if (!valid_statuses.includes(session_status)) {
        return res.status(400).json({
          error: `Invalid session_status. Must be one of: ${valid_statuses.join(', ')}`
        })
      }

      // Build patches for targeted field merge
      const patches = { session_status }

      // Set external_session on SessionStart when session_id is provided
      if (session_id) {
        const { readFile } = await import('fs/promises')
        const user_base_directory = get_user_base_directory()
        const thread_base_directory = get_thread_base_directory({
          user_base_directory
        })
        const metadata_path = `${thread_base_directory}/${thread_id}/metadata.json`
        try {
          const raw = await readFile(metadata_path, 'utf-8')
          const existing = JSON.parse(raw)
          if (!existing.external_session?.session_id) {
            const owner_public_key = existing.user_public_key || null
            const owner_thread_config = owner_public_key
              ? await user_registry.get_thread_config(owner_public_key)
              : null
            if (owner_thread_config && !existing.execution) {
              const owner =
                await user_registry.find_by_public_key(owner_public_key)
              const owner_username = owner?.username || null
              if (owner_username) {
                patches.execution = build_execution_attribution({
                  mode: 'container',
                  username: owner_username
                })
              }
            }
            patches.external_session = {
              ...(existing.external_session || {}),
              provider: 'claude',
              session_id
            }
          }
        } catch {
          return res.status(404).json({ error: 'Thread not found' })
        }
      }

      let metadata
      try {
        metadata = await patch_thread_metadata({ thread_id, patches })
      } catch {
        return res.status(404).json({ error: 'Thread not found' })
      }

      // Emit directly for immediate client feedback (bypass 2s watcher debounce)
      emit_thread_updated(metadata)

      log(`Thread ${thread_id}: session_status updated to '${session_status}'`)

      res.json({ success: true })
    } catch (error) {
      handle_errors(res, error, 'updating session status')
    }
  }
)

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

    // Permission: ownership-first, then read-permission fallback. The
    // resume action grants execute privilege, so callers must either own
    // the thread or hold an applicable permission grant. Mode-string
    // branching is intentionally absent -- per-user isolation is governed
    // by container dispatch below, not by ownership semantics.
    const is_owner = await validate_thread_ownership({
      user_public_key,
      thread_id
    })
    if (!is_owner) {
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

    // Re-derive the local routing variable from the canonical execution
    // attribution.
    const thread_container_name = thread.execution?.container_name
    const execution_mode = is_per_user_container(thread_container_name)
      ? 'container_user'
      : thread.execution?.mode === 'container'
        ? 'container'
        : 'host'

    // For per-user container dispatch, look up the requester's thread_config
    // and username so the queue payload routes into their isolated container.
    let thread_config = null
    let username = null
    if (execution_mode === 'container_user') {
      thread_config = await user_registry.get_thread_config(user_public_key)
      const user = thread_config
        ? await user_registry.find_by_public_key(user_public_key)
        : null
      username = user?.username || null
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

    // Use provided working_directory or fall back to thread's stored
    // directory. provider_metadata stores the resolved absolute path (as
    // reported by the Claude CLI transcript), but the validator only accepts
    // base URIs -- convert absolute paths under user_base_directory back to
    // a 'user:' URI so resume doesn't require callers to pass working_directory
    // explicitly.
    let working_directory =
      req.body.working_directory ||
      thread.external_session?.provider_metadata?.working_directory
    if (!working_directory) {
      return res.status(400).json({
        error: 'Invalid working_directory',
        message:
          'working_directory is required and could not be inferred from thread metadata'
      })
    }
    if (
      working_directory &&
      !is_valid_base_uri(working_directory) &&
      path.isAbsolute(working_directory)
    ) {
      try {
        working_directory = create_base_uri_from_path(working_directory, {
          user_base_directory: get_user_base_directory()
        })
      } catch (uri_error) {
        log(
          `Resume could not rewrite stored absolute working_directory to base URI: ${uri_error.message}`
        )
      }
    }

    // Fast-fail with a 400 for invalid base URIs. See create-session for why
    // the worker owns the authoritative resolve.
    try {
      await validate_working_directory({
        working_directory,
        user_base_directory: get_user_base_directory()
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
      working_directory,
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
        message: safe_error_message(error)
      })
    }

    handle_errors(res, error, 'resuming thread session')
  }
})

// Rate-limit map for sync-user-session: transcript_path -> last_sync_timestamp
const sync_rate_limit = new Map()
const SYNC_RATE_LIMIT_MS = 1800

// Periodic sweep: remove stale rate-limit entries every 5 minutes
setInterval(
  () => {
    const now = Date.now()
    for (const [key, timestamp] of sync_rate_limit) {
      if (now - timestamp > SYNC_RATE_LIMIT_MS) {
        sync_rate_limit.delete(key)
      }
    }
  },
  5 * 60 * 1000
).unref()

// Sync user session from container hooks
router.post('/sync-user-session', async (req, res) => {
  try {
    const {
      username,
      transcript_path,
      hook_event_name,
      user_public_key,
      known_thread_id
    } = req.body

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
    // SessionEnd bypasses rate limit unconditionally (final sync opportunity)
    const is_session_end = hook_event_name === 'SessionEnd'
    const last_sync = sync_rate_limit.get(transcript_path)
    if (
      !is_session_end &&
      last_sync &&
      Date.now() - last_sync < SYNC_RATE_LIMIT_MS
    ) {
      log(
        `sync-user-session: rate limited for ${transcript_path} (${hook_event_name})`
      )
      return res.json({ status: 'skipped', reason: 'rate_limited' })
    }
    sync_rate_limit.set(transcript_path, Date.now())

    const { translate_container_transcript_path } =
      await import('#libs-server/threads/user-container-manager.mjs')
    const translation = translate_container_transcript_path({
      username,
      transcript_path
    })
    if (translation.error) {
      return res.status(400).json({
        error: 'Invalid transcript_path',
        message: translation.error
      })
    }
    const host_path = translation.host_path

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

    const { create_threads_from_session_provider } =
      await import('#libs-server/integrations/thread/create-threads-from-session-provider.mjs')

    const sync_opts = {
      provider_name: 'claude',
      allow_updates: true,
      provider_options: {
        session_file: host_path
      },
      user_public_key,
      execution_overrides: build_execution_attribution({
        mode: 'container',
        username
      })
    }

    // Pass known_thread_id to skip deterministic check_thread_exists lookup
    if (known_thread_id) {
      sync_opts.known_thread_id = known_thread_id
    }

    const result = await create_threads_from_session_provider(sync_opts)

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
