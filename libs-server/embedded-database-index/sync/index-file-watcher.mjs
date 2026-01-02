/**
 * Index File Watcher
 *
 * Monitor filesystem for entity and thread changes using chokidar.
 */

import path from 'path'
import debug from 'debug'
import chokidar from 'chokidar'

import config from '#config'

const log = debug('embedded-index:sync:watcher')

let task_watcher = null
let thread_watcher = null
let tag_watcher = null
let is_watching = false

// Debounce map to prevent rapid re-indexing
const debounce_timers = new Map()
const DEBOUNCE_MS = 500

function get_user_base_directory() {
  return config.user_base_directory
}

function debounced_callback(file_path, callback) {
  const existing_timer = debounce_timers.get(file_path)
  if (existing_timer) {
    clearTimeout(existing_timer)
  }

  const timer = setTimeout(() => {
    debounce_timers.delete(file_path)
    callback(file_path)
  }, DEBOUNCE_MS)

  debounce_timers.set(file_path, timer)
}

export function start_index_file_watcher({
  on_task_change,
  on_task_delete,
  on_thread_change,
  on_thread_delete,
  on_tag_change,
  on_tag_delete
}) {
  if (is_watching) {
    log('File watcher already running')
    return
  }

  const user_base_dir = get_user_base_directory()
  if (!user_base_dir) {
    log('User base directory not configured, cannot start file watcher')
    return
  }

  log('Starting index file watcher for %s', user_base_dir)

  // Watch task directory for .md files
  const task_dir = path.join(user_base_dir, 'task')
  task_watcher = chokidar.watch(`${task_dir}/**/*.md`, {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 300,
      pollInterval: 100
    }
  })

  task_watcher
    .on('add', (file_path) => {
      log('Task file added: %s', file_path)
      if (on_task_change) {
        debounced_callback(file_path, on_task_change)
      }
    })
    .on('change', (file_path) => {
      log('Task file changed: %s', file_path)
      if (on_task_change) {
        debounced_callback(file_path, on_task_change)
      }
    })
    .on('unlink', (file_path) => {
      log('Task file deleted: %s', file_path)
      if (on_task_delete) {
        on_task_delete(file_path)
      }
    })

  // Watch thread directory for metadata.json files
  const thread_dir = path.join(user_base_dir, 'thread')
  thread_watcher = chokidar.watch(`${thread_dir}/*/metadata.json`, {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 300,
      pollInterval: 100
    }
  })

  thread_watcher
    .on('add', (file_path) => {
      log('Thread metadata added: %s', file_path)
      if (on_thread_change) {
        debounced_callback(file_path, on_thread_change)
      }
    })
    .on('change', (file_path) => {
      log('Thread metadata changed: %s', file_path)
      if (on_thread_change) {
        debounced_callback(file_path, on_thread_change)
      }
    })
    .on('unlink', (file_path) => {
      log('Thread metadata deleted: %s', file_path)
      if (on_thread_delete) {
        on_thread_delete(file_path)
      }
    })

  // Watch tag directory for .md files
  const tag_dir = path.join(user_base_dir, 'tag')
  tag_watcher = chokidar.watch(`${tag_dir}/**/*.md`, {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 300,
      pollInterval: 100
    }
  })

  tag_watcher
    .on('add', (file_path) => {
      log('Tag file added: %s', file_path)
      if (on_tag_change) {
        debounced_callback(file_path, on_tag_change)
      }
    })
    .on('change', (file_path) => {
      log('Tag file changed: %s', file_path)
      if (on_tag_change) {
        debounced_callback(file_path, on_tag_change)
      }
    })
    .on('unlink', (file_path) => {
      log('Tag file deleted: %s', file_path)
      if (on_tag_delete) {
        on_tag_delete(file_path)
      }
    })

  is_watching = true
  log('Index file watcher started')
}

export async function stop_index_file_watcher() {
  log('Stopping index file watcher')

  // Clear all debounce timers
  for (const timer of debounce_timers.values()) {
    clearTimeout(timer)
  }
  debounce_timers.clear()

  // Close watchers
  if (task_watcher) {
    await task_watcher.close()
    task_watcher = null
  }

  if (thread_watcher) {
    await thread_watcher.close()
    thread_watcher = null
  }

  if (tag_watcher) {
    await tag_watcher.close()
    tag_watcher = null
  }

  is_watching = false
  log('Index file watcher stopped')
}

export function is_file_watcher_running() {
  return is_watching
}

export function extract_thread_id_from_path(file_path) {
  // Extract thread UUID from path like: /path/to/thread/uuid-here/metadata.json
  const uuid_regex =
    /\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\//i
  const match = file_path.match(uuid_regex)
  return match ? match[1] : null
}

export function extract_base_uri_from_task_path(file_path) {
  // Convert absolute path to base_uri
  // Example: /path/to/user-base/task/base/my-task.md -> user:task/base/my-task.md
  const user_base_dir = get_user_base_directory()
  if (!user_base_dir || !file_path.startsWith(user_base_dir)) {
    return null
  }

  const relative_path = file_path.slice(user_base_dir.length + 1) // +1 for the trailing slash
  return `user:${relative_path}`
}
