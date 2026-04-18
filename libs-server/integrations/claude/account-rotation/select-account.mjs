import debug from 'debug'
import path from 'path'
import config from '#config'
import os from 'os'

import {
  check_account_usage,
  classify_usage_result,
  compute_account_score,
  get_cached_usage,
  is_account_exhausted,
  is_account_auth_failed,
  mark_account_auth_failed,
  mark_account_exhausted
} from './check-usage.mjs'

const is_complete_usage = (u) =>
  u && u.five_hour?.utilization != null && u.seven_day?.utilization != null

const log = debug('claude:account-selector')

/**
 * Resolve an account's config_dir to an absolute filesystem path, or null
 * for the default ~/.claude/ directory. Pure, side-effect-free.
 *
 * Claude Code stores its config at ~/.claude.json by default; setting
 * CLAUDE_CONFIG_DIR=~/.claude/ makes it look for ~/.claude/.claude.json
 * instead, which is a different file that lacks auth data. Returning null
 * for the default dir lets callers skip setting CLAUDE_CONFIG_DIR entirely.
 *
 * For container mode, the resolved_dir is a container path (e.g.
 * /home/node/.claude/) which won't match the host os.homedir(). path.basename
 * detects any path whose leaf directory is '.claude' regardless of parent.
 *
 * @param {Object} params
 * @param {Object} params.account - Account config object
 * @param {string} [params.execution_mode] - 'host', 'container', or 'container_user'
 * @returns {string|null} Absolute path, or null for default dir / missing config
 */
export const resolve_account_config_dir = ({
  account,
  execution_mode = 'host'
}) => {
  const raw_dir =
    execution_mode === 'container' || execution_mode === 'container_user'
      ? account.container_config_dir
      : account.config_dir

  if (raw_dir == null) return null

  const resolved_dir = raw_dir.startsWith('~/')
    ? path.join(os.homedir(), raw_dir.slice(2))
    : raw_dir

  const default_dir = path.join(os.homedir(), '.claude')
  const normalized = resolved_dir.replace(/\/+$/, '')
  const is_default =
    normalized === default_dir ||
    path.basename(normalized || '') === '.claude' ||
    raw_dir === '~/.claude/' ||
    raw_dir === '~/.claude'

  return is_default ? null : resolved_dir
}

/**
 * Error thrown when all configured accounts are exhausted
 */
export class AllAccountsExhaustedError extends Error {
  constructor(account_details = []) {
    const summary = account_details
      .map((a) => `${a.namespace}: ${a.reason || 'exhausted'}`)
      .join(', ')
    super(`All Claude accounts exhausted: ${summary}`)
    this.name = 'AllAccountsExhaustedError'
    this.account_details = account_details
  }
}

// Rate-limit Discord notifications (max 1 per hour per type)
let last_exhaustion_notification = 0
let last_auth_failure_notification = 0
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
 * @param {Function} [options.check_usage_fn] - Usage checker override (test seam); defaults to `check_account_usage`
 * @returns {Object|null} Account object with config_dir, or null if feature disabled
 * @throws {AllAccountsExhaustedError} If all accounts are exhausted
 */
export const select_account = async ({
  execution_mode = 'host',
  check_usage_fn = check_account_usage
} = {}) => {
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

  const threshold = accounts_config.utilization_threshold || 90

  // Probe all accounts in parallel. Each resolves to a classification
  // record; selection logic below preserves prior priority/score semantics.
  const probes = await Promise.all(
    accounts.map(async (account) => {
      if (await is_account_auth_failed(account.namespace)) {
        log('Account %s marked as auth_failed, skipping', account.namespace)
        return { account, kind: 'exhausted', reason: 'auth_failed' }
      }
      if (await is_account_exhausted(account.namespace)) {
        log('Account %s marked as exhausted, skipping', account.namespace)
        return { account, kind: 'exhausted', reason: 'marked_exhausted' }
      }

      const cached = await get_cached_usage(account.namespace)
      let usage = is_complete_usage(cached) ? cached : null

      if (usage === null) {
        const result = await check_usage_fn({
          namespace: account.namespace,
          org_uuid: account.org_uuid,
          browser_profile: account.browser_profile
        })
        if (
          result.error ||
          result.utilization == null ||
          !is_complete_usage(result.utilization)
        ) {
          log(
            'live check unavailable for %s: %s',
            account.namespace,
            result.error || 'incomplete usage data'
          )
          return { account, kind: 'unscored' }
        }
        usage = result.utilization
      }

      if (classify_usage_result({ utilization: usage, threshold }) === 'over') {
        log(
          'Account %s over threshold (5h: %d%%, 7d: %d%%), skipping',
          account.namespace,
          usage.five_hour?.utilization,
          usage.seven_day?.utilization
        )
        return { account, kind: 'exhausted', reason: 'over_threshold' }
      }

      const score = compute_account_score(usage)
      if (score !== null) {
        log('Account %s score: %.3f', account.namespace, score)
        return { account, kind: 'scored', score }
      }
      return { account, kind: 'unscored' }
    })
  )

  const exhausted_details = []
  const scored_candidates = []
  const unscored_candidates = []
  for (const probe of probes) {
    if (probe.kind === 'exhausted') {
      exhausted_details.push({
        namespace: probe.account.namespace,
        reason: probe.reason
      })
    } else if (probe.kind === 'scored') {
      scored_candidates.push({ account: probe.account, score: probe.score })
    } else {
      unscored_candidates.push({ account: probe.account })
    }
  }

  // Sort scored by score ascending (expiring first), priority as tiebreaker
  scored_candidates.sort(
    (a, b) => a.score - b.score || a.account.priority - b.account.priority
  )

  // Sort unscored by priority
  unscored_candidates.sort((a, b) => a.account.priority - b.account.priority)

  // Scored accounts first (prefer known expiring), then unscored
  const candidates = [...scored_candidates, ...unscored_candidates]

  if (candidates.length > 0) {
    const { account } = candidates[0]
    const config_dir = resolve_account_config_dir({ account, execution_mode })

    log(
      'Selected account: %s (config_dir: %s)',
      account.namespace,
      config_dir || '(default)'
    )

    return {
      namespace: account.namespace,
      config_dir,
      org_uuid: account.org_uuid,
      browser_profile: account.browser_profile,
      priority: account.priority
    }
  }

  // All accounts exhausted
  await notify_all_exhausted(accounts)
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
 * Handle an authentication failure for an account.
 * Marks the account with a distinct auth_failed status and sends a Discord
 * notification since auth failures require manual re-authentication.
 *
 * @param {Object} params
 * @param {string} params.namespace - Account namespace
 */
export const handle_auth_failure = async ({ namespace }) => {
  log('Handling auth failure for %s', namespace)
  await mark_account_auth_failed(namespace)
  await notify_auth_failure(namespace)
}

/**
 * Send a Discord embed notification via webhook
 */
const send_discord_embed = async ({ title, description, color, fields }) => {
  const discord_webhook_url = config.job_tracker?.discord_webhook_url
  if (!discord_webhook_url) {
    return
  }

  const payload = {
    embeds: [
      {
        title,
        description,
        color,
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
      log('Discord notification failed (%s): %d', title, response.status)
    }
  } catch (error) {
    log('Discord notification error (%s): %s', title, error.message)
  }
}

/**
 * Send Discord notification when an account has an authentication failure
 */
const notify_auth_failure = async (namespace) => {
  const now = Date.now()
  if (now - last_auth_failure_notification < NOTIFICATION_COOLDOWN_MS) {
    log('Skipping auth failure notification (cooldown)')
    return
  }
  last_auth_failure_notification = now

  await send_discord_embed({
    title: 'Claude Account Authentication Failed',
    description: `Account \`${namespace}\` has an expired or invalid OAuth token. Manual re-authentication required.`,
    color: 15105570, // Orange
    fields: [
      { name: 'Account', value: namespace, inline: true },
      { name: 'Server', value: os.hostname(), inline: true },
      {
        name: 'Action Required',
        value:
          'Re-authenticate on MacBook, extract credentials from Keychain, and redeploy to container.',
        inline: false
      }
    ]
  })
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
  last_exhaustion_notification = now

  const fields = accounts.map((a) => ({
    name: a.namespace,
    value: 'Exhausted',
    inline: true
  }))
  fields.push({ name: 'Server', value: os.hostname(), inline: true })

  await send_discord_embed({
    title: 'All Claude Accounts Exhausted',
    description:
      'No accounts available for queue sessions. Jobs will be retried with backoff.',
    color: 15548997, // Red
    fields
  })
}
