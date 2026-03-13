import debug from 'debug'
import path from 'path'
import config from '#config'
import os from 'os'

import {
  check_account_usage,
  is_account_exhausted,
  mark_account_exhausted
} from './check-usage.mjs'

const log = debug('claude:account-selector')

/**
 * Error thrown when all configured accounts are exhausted
 */
export class AllAccountsExhaustedError extends Error {
  constructor(account_details = []) {
    const summary = account_details
      .map(
        (a) =>
          `${a.namespace}: ${a.reason || 'exhausted'}`
      )
      .join(', ')
    super(`All Claude accounts exhausted: ${summary}`)
    this.name = 'AllAccountsExhaustedError'
    this.account_details = account_details
  }
}

// Rate-limit Discord notifications (max 1 per hour)
let last_exhaustion_notification = 0
const NOTIFICATION_COOLDOWN_MS = 3600000

/**
 * Select the best available Claude account for a queue session
 *
 * Implements rotate-on-failure strategy:
 * - Checks Redis exhausted markers first (set by previous failures)
 * - Falls back to usage API check only when needed
 * - Returns null if feature is disabled (caller uses default behavior)
 *
 * @param {Object} [options]
 * @param {string} [options.execution_mode] - 'host' or 'container' (determines which config_dir to return)
 * @returns {Object|null} Account object with config_dir, or null if feature disabled
 * @throws {AllAccountsExhaustedError} If all accounts are exhausted
 */
export const select_account = async ({ execution_mode = 'host' } = {}) => {
  const accounts_config = config.claude_accounts
  if (!accounts_config?.enabled) {
    log('Account rotation disabled')
    return null
  }

  const accounts = accounts_config.accounts || []
  if (accounts.length === 0) {
    log('No accounts configured')
    return null
  }

  // Sort by priority (lower = higher priority)
  const sorted = [...accounts].sort((a, b) => a.priority - b.priority)
  const exhausted_details = []

  for (const account of sorted) {
    // Check Redis exhausted marker first (fast path)
    const exhausted = await is_account_exhausted(account.namespace)
    if (exhausted) {
      log('Account %s marked as exhausted, skipping', account.namespace)
      exhausted_details.push({
        namespace: account.namespace,
        reason: 'marked_exhausted'
      })
      continue
    }

    // Account not marked exhausted -- use it
    const raw_dir =
      execution_mode === 'container' || execution_mode === 'container_user'
        ? account.container_config_dir
        : account.config_dir

    // Resolve tilde to absolute path (tilde won't expand in env vars)
    const config_dir = raw_dir?.startsWith('~/')
      ? path.join(os.homedir(), raw_dir.slice(2))
      : raw_dir

    log('Selected account: %s (config_dir: %s)', account.namespace, config_dir)

    return {
      namespace: account.namespace,
      config_dir,
      org_uuid: account.org_uuid,
      browser_profile: account.browser_profile,
      priority: account.priority
    }
  }

  // All accounts exhausted -- try usage check to get resets_at for backoff
  await notify_all_exhausted(sorted)
  throw new AllAccountsExhaustedError(exhausted_details)
}

/**
 * Handle a rate-limit failure for an account
 *
 * Marks the account as exhausted and optionally checks usage API
 * to determine resets_at for accurate TTL.
 *
 * @param {Object} params
 * @param {string} params.namespace - Account namespace
 * @param {string} [params.org_uuid] - Organization UUID for usage check
 * @param {string} [params.browser_profile] - CloakBrowser profile for usage check
 */
export const handle_rate_limit_failure = async ({
  namespace,
  org_uuid,
  browser_profile
}) => {
  log('Handling rate limit failure for %s', namespace)

  let resets_at = null

  // Try to get resets_at from usage API for accurate TTL
  if (org_uuid && browser_profile) {
    try {
      const result = await check_account_usage({
        namespace,
        org_uuid,
        browser_profile
      })

      if (result.utilization) {
        // Use the latest reset time (account unavailable until all windows reset)
        const five_hour_reset = result.utilization.five_hour?.resets_at
        const seven_day_reset = result.utilization.seven_day?.resets_at

        if (five_hour_reset && seven_day_reset) {
          resets_at =
            new Date(five_hour_reset) > new Date(seven_day_reset)
              ? five_hour_reset
              : seven_day_reset
        } else {
          resets_at = five_hour_reset || seven_day_reset
        }
      }
    } catch (error) {
      log('Usage check during rate-limit handling failed: %s', error.message)
    }
  }

  await mark_account_exhausted(namespace, resets_at)
}

/**
 * Send Discord notification when all accounts are exhausted (rate-limited)
 */
const notify_all_exhausted = async (accounts) => {
  const now = Date.now()
  if (now - last_exhaustion_notification < NOTIFICATION_COOLDOWN_MS) {
    log('Skipping exhaustion notification (cooldown)')
    return
  }

  const discord_webhook_url = config.job_tracker?.discord_webhook_url
  if (!discord_webhook_url) {
    return
  }

  last_exhaustion_notification = now

  const fields = accounts.map((a) => ({
    name: a.namespace,
    value: 'Exhausted',
    inline: true
  }))

  fields.push({
    name: 'Server',
    value: os.hostname(),
    inline: true
  })

  const payload = {
    embeds: [
      {
        title: 'All Claude Accounts Exhausted',
        description:
          'No accounts available for queue sessions. Jobs will be retried with backoff.',
        color: 15548997, // Red
        fields,
        timestamp: new Date().toISOString()
      }
    ]
  }

  try {
    const response = await fetch(discord_webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000)
    })

    if (!response.ok) {
      log('Discord notification failed: %d', response.status)
    }
  } catch (error) {
    log('Discord notification error: %s', error.message)
  }
}
