/**
 * Parcel Watcher Adapter
 *
 * Shared wrapper around @parcel/watcher providing consistent interface
 * for directory subscriptions with ignore patterns and error handling.
 *
 * @parcel/watcher uses native OS backends (FSEvents on macOS, inotify on Linux)
 * and only creates directory-level watches, eliminating per-file inotify overhead.
 */

import { subscribe } from '@parcel/watcher'
import debug from 'debug'

const log = debug('file-subscriptions:parcel-adapter')

// Standard ignore patterns applied to all subscriptions
const DEFAULT_IGNORE = [
  '**/.git',
  '**/node_modules',
  '**/*.swp',
  '**/*~',
  '**/.DS_Store'
]

/**
 * Create a @parcel/watcher subscription for a directory.
 *
 * @param {Object} params
 * @param {string} params.directory - Absolute path to watch
 * @param {string[]} [params.ignore] - Additional ignore patterns (merged with defaults)
 * @param {Function} params.on_events - Callback receiving Array<{type: 'create'|'update'|'delete', path: string}>
 * @param {Function} [params.on_error] - Optional error callback, called with the error object when watcher errors occur
 * @returns {Promise<{unsubscribe: Function}>} Subscription handle
 */
export async function create_parcel_subscription({
  directory,
  ignore = [],
  on_events,
  on_error
}) {
  const all_ignore = [...DEFAULT_IGNORE, ...ignore]

  log(
    'Creating subscription for %s (ignoring %d patterns)',
    directory,
    all_ignore.length
  )

  const subscription = await subscribe(
    directory,
    (err, events) => {
      if (err) {
        log('Watcher error for %s: %O', directory, err)
        console.error(
          `[parcel-watcher] Subscription error for ${directory}: ${err.message}. File watching may be degraded.`
        )
        if (on_error) {
          on_error(err)
        }
        return
      }
      on_events(events)
    },
    { ignore: all_ignore }
  )

  log('Subscription active for %s', directory)
  return subscription
}
