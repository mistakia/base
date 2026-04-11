import IORedis from 'ioredis'
import debug from 'debug'
import config from '#config'

const log = debug('active-sessions:store')

/**
 * Redis-backed store for active Claude Code session state
 * Tracks running sessions with automatic TTL-based cleanup
 */

// Configuration with defaults
const STORE_CONFIG = {
  redis_url:
    config.active_sessions?.redis_url ||
    config.threads?.queue?.redis_url ||
    process.env.REDIS_URL ||
    'redis://localhost:6379',
  key_prefix: config.active_sessions?.redis_key_prefix || 'active-session',
  stale_timeout_seconds:
    config.active_sessions?.session_ttl_seconds ||
    (config.active_sessions?.stale_timeout_minutes || 10) * 60
}

// Module-level singleton instance
let redis_connection = null

/**
 * Initialize Redis connection with event handlers
 *
 * @returns {IORedis} Redis connection instance
 */
const initialize_redis_connection = () => {
  log(`Connecting to Redis: ${STORE_CONFIG.redis_url}`)

  const connection = new IORedis(STORE_CONFIG.redis_url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true
  })

  connection.on('error', (error) => {
    log('Redis connection error:', error.message)
  })

  connection.on('connect', () => {
    log('Redis connected for active sessions')
  })

  return connection
}

/**
 * Get or create Redis connection singleton
 *
 * @returns {IORedis} Redis connection instance
 */
const get_redis_connection = () => {
  if (!redis_connection) {
    redis_connection = initialize_redis_connection()
  }
  return redis_connection
}

/**
 * Build Redis key for a session
 *
 * @param {string} session_id - Session ID
 * @returns {string} Redis key
 */
const build_session_key = (session_id) => {
  return `${STORE_CONFIG.key_prefix}:${session_id}`
}

/**
 * Build Redis key for a deletion tombstone
 *
 * Tombstones prevent the PUT upsert from re-creating a session after
 * DELETE has removed it. This addresses a race condition where hook
 * curl calls run in the background: if a Stop (PUT idle) arrives after
 * a SessionEnd (DELETE), the Lua upsert would otherwise re-create the
 * session as a ghost that persists until TTL expires.
 *
 * @param {string} session_id - Session ID
 * @returns {string} Redis key
 */
const build_tombstone_key = (session_id) => {
  return `session-deleted:${session_id}`
}

// Tombstone TTL: must outlast the longest possible in-flight background curl.
// Hook scripts set --max-time 5 on curl requests; the admin hook has no
// explicit timeout but local curls complete in <1s. 10s provides margin
// for slow HTTPS handshakes while keeping the window short enough that
// fast session resumes (same session_id via -r) are minimally affected.
const TOMBSTONE_TTL_SECONDS = 10

/**
 * Register a new active session
 *
 * @param {Object} params - Session parameters
 * @param {string} params.session_id - Claude session ID
 * @param {string} params.working_directory - Working directory for the session
 * @param {string} params.transcript_path - Path to Claude transcript file
 * @param {string} [params.job_id] - BullMQ job ID for client correlation
 * @param {boolean} [params.resume=false] - When true, clears any deletion
 *   tombstone and re-registers (Claude Code SessionStart source=resume).
 *   When false (default) and a tombstone exists, registration is refused.
 * @returns {Promise<Object|null>} Registered session record, or null when
 *   a tombstone blocks re-registration (non-resume caller).
 */
export const register_active_session = async ({
  session_id,
  working_directory,
  transcript_path,
  job_id,
  resume = false
}) => {
  const redis = get_redis_connection()
  const key = build_session_key(session_id)
  const tombstone_key = build_tombstone_key(session_id)

  // Tombstone-aware registration: if the session was just deleted, refuse to
  // re-register unless the caller explicitly signals a resume. This blocks the
  // POST-after-DELETE race for short sessions where the SessionStart POST
  // lands after the SessionEnd DELETE, which would otherwise create an
  // orphaned session with no subsequent ENDED event.
  const tombstone_exists = await redis.exists(tombstone_key)
  if (tombstone_exists) {
    if (!resume) {
      log(`Skipped registration for tombstoned session: ${session_id}`)
      return null
    }
    // Resume: same session_id intentionally re-registering. Clear the
    // tombstone so subsequent updates are not blocked.
    await redis.del(tombstone_key)
  }

  const now = new Date().toISOString()

  // Check for existing session (resume case: same session_id re-registers)
  const existing_raw = await redis.get(key)
  let session

  if (existing_raw) {
    // Preserve created_at, thread_id, and other accumulated fields from the
    // original registration. Only reset status and activity timestamps.
    const existing = JSON.parse(existing_raw)
    session = {
      ...existing,
      status: 'active',
      working_directory,
      transcript_path,
      job_id: job_id || existing.job_id || null,
      started_at: now,
      last_activity_at: now,
      event_seq: (existing.event_seq || 0) + 1
    }
    log(`Re-registered active session (resume): ${session_id}`)
  } else {
    session = {
      session_id,
      status: 'active',
      thread_id: null,
      thread_title: null,
      latest_timeline_event: null,
      working_directory,
      transcript_path,
      job_id: job_id || null,
      created_at: now,
      started_at: now,
      last_activity_at: now,
      event_seq: 1
    }
    log(`Registered active session: ${session_id}`)
  }

  await redis.setex(
    key,
    STORE_CONFIG.stale_timeout_seconds,
    JSON.stringify(session)
  )

  return session
}

/**
 * Update an existing active session (with upsert behavior)
 *
 * @param {Object} params - Session update parameters
 * @param {string} params.session_id - Claude session ID
 * @param {string} [params.status] - New status (active/idle)
 * @param {string} [params.thread_id] - Associated thread ID
 * @param {string} [params.thread_title] - Thread title
 * @param {Object} [params.latest_timeline_event] - Latest timeline event from thread
 * @param {string} [params.working_directory] - Working directory (for upsert)
 * @param {string} [params.transcript_path] - Transcript path (for upsert)
 * @param {number} [params.message_count] - Number of messages in thread
 * @param {number} [params.duration_minutes] - Duration in minutes
 * @param {number} [params.total_tokens] - Total token count
 * @param {string} [params.source_provider] - Source provider name
 * @param {string} [params.job_id] - BullMQ job ID for client correlation
 * @returns {Promise<Object|null>} Updated session record or null if not found
 */
// Lua script for atomic session update: reads existing session, merges
// update fields, sets last_activity_at, and writes back with TTL -- all
// in a single Redis command to prevent concurrent update races.
const UPDATE_SESSION_SCRIPT = `
local key = KEYS[1]
local tombstone_key = KEYS[2]
local ttl = tonumber(ARGV[1])
local update_json = ARGV[2]
local now = ARGV[3]
local session_id = ARGV[4]

local existing = redis.call('GET', key)
local session

if existing then
  session = cjson.decode(existing)
else
  -- Check for deletion tombstone before upserting. If the session was
  -- recently deleted (SessionEnd), a late-arriving PUT (from Stop or
  -- PostToolUse background curl) must not re-create it.
  if redis.call('EXISTS', tombstone_key) == 1 then
    return nil
  end

  -- Upsert: create new session if missing (handles missed SessionStart).
  -- Nullable fields are omitted (absent keys encode as missing in JSON,
  -- which JavaScript JSON.parse reads as undefined -- callers handle both).
  session = {
    session_id = session_id,
    status = 'active',
    created_at = now,
    started_at = now,
    event_seq = 0
  }
end

-- Merge update fields (only non-nil values)
local updates = cjson.decode(update_json)
for k, v in pairs(updates) do
  session[k] = v
end

session.last_activity_at = now
session.event_seq = (session.event_seq or 0) + 1

local result = cjson.encode(session)
redis.call('SETEX', key, ttl, result)
return result
`

export const update_active_session = async ({
  session_id,
  status,
  thread_id,
  thread_title,
  thread_created_at,
  latest_timeline_event,
  working_directory,
  transcript_path,
  message_count,
  duration_minutes,
  total_tokens,
  source_provider,
  job_id,
  context_percentage,
  context_window_size
}) => {
  const redis = get_redis_connection()
  const key = build_session_key(session_id)

  // Build update fields object (only include defined values)
  const updates = {}
  if (status !== undefined) updates.status = status
  if (thread_id !== undefined) updates.thread_id = thread_id
  if (thread_title !== undefined) updates.thread_title = thread_title
  if (thread_created_at !== undefined)
    updates.thread_created_at = thread_created_at
  if (latest_timeline_event !== undefined)
    updates.latest_timeline_event = latest_timeline_event
  if (working_directory !== undefined)
    updates.working_directory = working_directory
  if (transcript_path !== undefined) updates.transcript_path = transcript_path
  if (message_count !== undefined) updates.message_count = message_count
  if (duration_minutes !== undefined)
    updates.duration_minutes = duration_minutes
  if (total_tokens !== undefined) updates.total_tokens = total_tokens
  if (source_provider !== undefined) updates.source_provider = source_provider
  if (job_id !== undefined) updates.job_id = job_id
  if (context_percentage !== undefined)
    updates.context_percentage = context_percentage
  if (context_window_size !== undefined)
    updates.context_window_size = context_window_size

  const now = new Date().toISOString()
  const tombstone_key = build_tombstone_key(session_id)

  const result = await redis.eval(
    UPDATE_SESSION_SCRIPT,
    2,
    key,
    tombstone_key,
    STORE_CONFIG.stale_timeout_seconds,
    JSON.stringify(updates),
    now,
    session_id
  )

  if (result === null) {
    log(`Skipped upsert for deleted session: ${session_id} (tombstone present)`)
    return null
  }

  const session = JSON.parse(result)
  log(`Updated active session: ${session_id} status=${session.status}`)
  return session
}

/**
 * Get a specific active session by ID
 *
 * @param {string} session_id - Claude session ID
 * @returns {Promise<Object|null>} Session record or null if not found
 */
export const get_active_session = async (session_id) => {
  const redis = get_redis_connection()
  const key = build_session_key(session_id)

  const data = await redis.get(key)
  if (!data) {
    return null
  }

  return JSON.parse(data)
}

/**
 * Get all active sessions
 *
 * @returns {Promise<Array<Object>>} Array of session records
 */
export const get_all_active_sessions = async () => {
  const redis = get_redis_connection()
  const pattern = `${STORE_CONFIG.key_prefix}:*`

  // Use SCAN cursor instead of KEYS to avoid blocking Redis
  const keys = []
  let cursor = '0'
  do {
    const [next_cursor, batch] = await redis.scan(
      cursor,
      'MATCH',
      pattern,
      'COUNT',
      100
    )
    cursor = next_cursor
    keys.push(...batch)
  } while (cursor !== '0')

  if (keys.length === 0) {
    return []
  }

  const values = await redis.mget(keys)
  const sessions = values.filter((v) => v !== null).map((v) => JSON.parse(v))

  log(`Retrieved ${sessions.length} active sessions`)
  return sessions
}

/**
 * Remove an active session
 *
 * @param {string} session_id - Claude session ID
 * @returns {Promise<boolean>} True if session was removed
 */
export const remove_active_session = async (session_id) => {
  const redis = get_redis_connection()
  const key = build_session_key(session_id)
  const tombstone_key = build_tombstone_key(session_id)

  const result = await redis.del(key)
  const removed = result > 0

  // Set tombstone to prevent late-arriving PUT upserts from re-creating
  await redis.setex(tombstone_key, TOMBSTONE_TTL_SECONDS, '1')

  if (removed) {
    log(`Removed active session: ${session_id}`)
  }

  return removed
}

/**
 * Get and remove an active session atomically
 *
 * Uses Redis GETDEL to read and delete in a single atomic command,
 * preventing race conditions from concurrent session termination requests.
 * The caller can include session data in the ENDED WebSocket event for
 * permission checks.
 *
 * @param {string} session_id - Claude session ID
 * @returns {Promise<Object|null>} Session data before removal, or null if not found
 */
export const get_and_remove_active_session = async (session_id) => {
  const redis = get_redis_connection()
  const key = build_session_key(session_id)
  const tombstone_key = build_tombstone_key(session_id)

  const data = await redis.getdel(key)

  // Set tombstone to prevent late-arriving PUT upserts from re-creating
  await redis.setex(tombstone_key, TOMBSTONE_TTL_SECONDS, '1')

  if (data) {
    const session = JSON.parse(data)
    // Bump event_seq so the ENDED event carries a sequence higher than the
    // last stored UPDATE. This lets the client reducer discard any stale
    // UPDATED events that arrive after ENDED.
    session.event_seq = (session.event_seq || 0) + 1
    log(`Got and removed active session: ${session_id}`)
    return session
  }

  log(`Session ${session_id} not found for get-and-remove`)
  return null
}

/**
 * Get active sessions for a specific thread
 *
 * @param {string} thread_id - Thread ID
 * @returns {Promise<Object|null>} Session record or null if not found
 */
export const get_active_session_for_thread = async (thread_id) => {
  const sessions = await get_all_active_sessions()
  return sessions.find((s) => s.thread_id === thread_id) || null
}

/**
 * Close the Redis connection gracefully
 *
 * @returns {Promise<void>}
 */
export const close_session_store = async () => {
  if (redis_connection) {
    await redis_connection.quit()
    redis_connection = null
    log('Active session store closed')
  }
}
