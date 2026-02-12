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
 * Register a new active session
 *
 * @param {Object} params - Session parameters
 * @param {string} params.session_id - Claude session ID
 * @param {string} params.working_directory - Working directory for the session
 * @param {string} params.transcript_path - Path to Claude transcript file
 * @returns {Promise<Object>} Registered session record
 */
export const register_active_session = async ({
  session_id,
  working_directory,
  transcript_path
}) => {
  const redis = get_redis_connection()
  const key = build_session_key(session_id)

  const session = {
    session_id,
    status: 'active',
    thread_id: null,
    thread_title: null,
    latest_timeline_event: null,
    working_directory,
    transcript_path,
    started_at: new Date().toISOString(),
    last_activity_at: new Date().toISOString()
  }

  await redis.setex(
    key,
    STORE_CONFIG.stale_timeout_seconds,
    JSON.stringify(session)
  )

  log(`Registered active session: ${session_id}`)
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
 * @returns {Promise<Object|null>} Updated session record or null if not found
 */
export const update_active_session = async ({
  session_id,
  status,
  thread_id,
  thread_title,
  latest_timeline_event,
  working_directory,
  transcript_path,
  message_count,
  duration_minutes,
  total_tokens,
  source_provider
}) => {
  const redis = get_redis_connection()
  const key = build_session_key(session_id)

  // Get existing session
  const existing = await redis.get(key)
  let session

  if (existing) {
    // Update existing session
    session = JSON.parse(existing)
    if (status !== undefined) session.status = status
    if (thread_id !== undefined) session.thread_id = thread_id
    if (thread_title !== undefined) session.thread_title = thread_title
    if (latest_timeline_event !== undefined)
      session.latest_timeline_event = latest_timeline_event
    if (message_count !== undefined) session.message_count = message_count
    if (duration_minutes !== undefined)
      session.duration_minutes = duration_minutes
    if (total_tokens !== undefined) session.total_tokens = total_tokens
    if (source_provider !== undefined) session.source_provider = source_provider
    session.last_activity_at = new Date().toISOString()
  } else {
    // Upsert: create new session if missing (handles missed SessionStart)
    session = {
      session_id,
      status: status || 'active',
      thread_id: thread_id || null,
      thread_title: thread_title || null,
      latest_timeline_event: latest_timeline_event || null,
      working_directory: working_directory || null,
      transcript_path: transcript_path || null,
      message_count: message_count || null,
      duration_minutes: duration_minutes || null,
      total_tokens: total_tokens || null,
      source_provider: source_provider || null,
      started_at: new Date().toISOString(),
      last_activity_at: new Date().toISOString()
    }
    log(`Upserted new session (missed SessionStart): ${session_id}`)
  }

  await redis.setex(
    key,
    STORE_CONFIG.stale_timeout_seconds,
    JSON.stringify(session)
  )

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

  const result = await redis.del(key)
  const removed = result > 0

  if (removed) {
    log(`Removed active session: ${session_id}`)
  }

  return removed
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
