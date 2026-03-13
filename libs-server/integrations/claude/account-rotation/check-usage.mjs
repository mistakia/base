import { execFile } from 'child_process'
import { promisify } from 'util'
import debug from 'debug'
import config from '#config'
import { get_redis_connection } from '#libs-server/redis/get-connection.mjs'

const exec_file = promisify(execFile)
const log = debug('claude:usage')

const REDIS_KEY_PREFIX = 'claude:usage:'
const REDIS_EXHAUSTED_PREFIX = 'claude:exhausted:'

// CloakBrowser venv paths by platform
const CLOAKBROWSER_PATHS = {
  darwin: `${process.env.HOME}/.local/share/cloakbrowser-venv/bin/python3`,
  linux: `${process.env.HOME}/.local/share/cloakbrowser-venv/bin/python3`
}

const CLOAKBROWSER_SCRIPT = `${config.user_base_directory || process.env.USER_BASE_DIRECTORY}/cli/browser/cloak-browser.py`

/**
 * Get cached usage data from Redis
 *
 * @param {string} namespace - Account namespace
 * @returns {Object|null} Cached usage data or null
 */
export const get_cached_usage = async (namespace) => {
  try {
    const redis = get_redis_connection()
    const data = await redis.get(`${REDIS_KEY_PREFIX}${namespace}`)
    if (data) {
      return JSON.parse(data)
    }
  } catch (error) {
    log('Cache read error for %s: %s', namespace, error.message)
  }
  return null
}

/**
 * Store usage data in Redis with TTL
 *
 * @param {string} namespace - Account namespace
 * @param {Object} data - Usage data to cache
 * @param {number} ttl_seconds - Cache TTL in seconds
 */
export const set_cached_usage = async (namespace, data, ttl_seconds) => {
  try {
    const redis = get_redis_connection()
    await redis.set(
      `${REDIS_KEY_PREFIX}${namespace}`,
      JSON.stringify(data),
      'EX',
      ttl_seconds
    )
  } catch (error) {
    log('Cache write error for %s: %s', namespace, error.message)
  }
}

/**
 * Mark an account as exhausted in Redis with TTL based on resets_at
 *
 * @param {string} namespace - Account namespace
 * @param {string} [resets_at] - ISO 8601 reset timestamp (TTL derived from this)
 */
export const mark_account_exhausted = async (namespace, resets_at = null) => {
  try {
    const redis = get_redis_connection()
    const key = `${REDIS_EXHAUSTED_PREFIX}${namespace}`

    let ttl_seconds = 3600 // Default 1 hour if no resets_at
    if (resets_at) {
      const reset_ms = new Date(resets_at).getTime() - Date.now()
      if (reset_ms > 0) {
        ttl_seconds = Math.ceil(reset_ms / 1000) + 60 // Add 60s buffer
      }
    }

    await redis.set(key, new Date().toISOString(), 'EX', ttl_seconds)
    log('Marked %s as exhausted (TTL: %ds)', namespace, ttl_seconds)
  } catch (error) {
    log('Failed to mark %s as exhausted: %s', namespace, error.message)
  }
}

/**
 * Check if an account is marked as exhausted in Redis
 *
 * @param {string} namespace - Account namespace
 * @returns {boolean} True if account is marked exhausted
 */
export const is_account_exhausted = async (namespace) => {
  try {
    const redis = get_redis_connection()
    const result = await redis.get(`${REDIS_EXHAUSTED_PREFIX}${namespace}`)
    return result !== null
  } catch (error) {
    log('Exhausted check error for %s: %s', namespace, error.message)
    return false
  }
}

/**
 * Clear exhausted marker for an account
 *
 * @param {string} namespace - Account namespace
 */
export const clear_account_exhausted = async (namespace) => {
  try {
    const redis = get_redis_connection()
    await redis.del(`${REDIS_EXHAUSTED_PREFIX}${namespace}`)
    log('Cleared exhausted marker for %s', namespace)
  } catch (error) {
    log('Failed to clear exhausted marker for %s: %s', namespace, error.message)
  }
}

/**
 * Execute a CloakBrowser CLI command
 *
 * @param {string} subcommand - CloakBrowser subcommand (open, evaluate, status)
 * @param {Array<string>} args - Additional arguments
 * @param {Object} [options] - execFile options
 * @returns {Object} { stdout, stderr }
 */
const exec_cloakbrowser = async (subcommand, args = [], options = {}) => {
  const python_path = CLOAKBROWSER_PATHS[process.platform]
  if (!python_path) {
    throw new Error(`Unsupported platform: ${process.platform}`)
  }

  const full_args = [CLOAKBROWSER_SCRIPT, subcommand, ...args]
  log('exec: %s %s', python_path, full_args.join(' '))

  return exec_file(python_path, full_args, {
    timeout: 30000,
    ...options
  })
}

/**
 * Ensure CloakBrowser daemon is running for a profile
 *
 * @param {string} browser_profile - Profile name
 */
const ensure_daemon_running = async (browser_profile) => {
  try {
    await exec_cloakbrowser('status', ['--profile', browser_profile])
    log('Daemon already running for %s', browser_profile)
  } catch {
    // Daemon not running, start it
    log('Starting daemon for %s', browser_profile)
    await exec_cloakbrowser('open', [
      'https://claude.ai/',
      '--profile',
      browser_profile,
      '--headless'
    ])
  }
}

/**
 * Check account usage via CloakBrowser and claude.ai API
 *
 * Uses CloakBrowser to evaluate a fetch() call against the usage API endpoint.
 * Results are cached in Redis to minimize browser interactions.
 *
 * @param {Object} params
 * @param {string} params.namespace - Account namespace
 * @param {string} params.org_uuid - Organization UUID
 * @param {string} params.browser_profile - CloakBrowser profile name
 * @returns {Object} { available: boolean, utilization: Object|null, cached: boolean, error: string|null }
 */
export const check_account_usage = async ({
  namespace,
  org_uuid,
  browser_profile
}) => {
  const cache_ttl =
    config.claude_accounts?.usage_check_cache_seconds || 300
  const threshold = config.claude_accounts?.utilization_threshold || 90

  // Check cache first
  const cached = await get_cached_usage(namespace)
  if (cached) {
    log('Using cached usage for %s', namespace)
    const available = is_usage_available(cached, threshold)
    return { available, utilization: cached, cached: true, error: null }
  }

  // Live check via CloakBrowser
  try {
    await ensure_daemon_running(browser_profile)

    const js_code = `fetch('/api/organizations/${org_uuid}/usage').then(r => r.json()).then(d => JSON.stringify(d))`
    const { stdout } = await exec_cloakbrowser('evaluate', [
      js_code,
      '--profile',
      browser_profile
    ])

    const raw = stdout.trim()

    // Check for HTML response (Cloudflare challenge or redirect)
    if (raw.startsWith('<') || raw.includes('<!DOCTYPE')) {
      log('Got HTML response for %s (possible Cloudflare challenge)', namespace)
      return {
        available: false,
        utilization: null,
        cached: false,
        error: 'cloudflare_challenge'
      }
    }

    const usage_data = JSON.parse(raw)

    // Check for API error responses
    if (usage_data.type === 'permission_error') {
      log('Session expired for %s', namespace)
      return {
        available: false,
        utilization: null,
        cached: false,
        error: 'session_expired'
      }
    }

    if (usage_data.type === 'not_found_error') {
      log('Invalid org UUID for %s', namespace)
      return {
        available: false,
        utilization: null,
        cached: false,
        error: 'invalid_org_uuid'
      }
    }

    // Cache the result
    await set_cached_usage(namespace, usage_data, cache_ttl)

    const available = is_usage_available(usage_data, threshold)
    log(
      'Usage for %s: five_hour=%d, seven_day=%d, available=%s',
      namespace,
      usage_data.five_hour?.utilization,
      usage_data.seven_day?.utilization,
      available
    )

    return { available, utilization: usage_data, cached: false, error: null }
  } catch (error) {
    log('Usage check failed for %s: %s', namespace, error.message)
    return {
      available: false,
      utilization: null,
      cached: false,
      error: error.message
    }
  }
}

/**
 * Determine if usage levels are below the threshold
 *
 * @param {Object} usage_data - Usage API response
 * @param {number} threshold - Utilization threshold (0-100)
 * @returns {boolean} True if account is available
 */
const is_usage_available = (usage_data, threshold) => {
  const five_hour = usage_data.five_hour?.utilization ?? 0
  const seven_day = usage_data.seven_day?.utilization ?? 0
  return five_hour < threshold && seven_day < threshold
}
