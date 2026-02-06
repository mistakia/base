import debug from 'debug'
import path from 'path'
import fs from 'fs/promises'

import server from '#server/index.mjs'
import config from '#config'
import {
  start_thread_watcher,
  stop_thread_watcher,
  set_thread_watcher_hooks
} from '#server/services/thread-watcher.mjs'
import { start_worker, stop_worker } from '#libs-server/threads/job-worker.mjs'
import embedded_index_manager from '#libs-server/embedded-database-index/embedded-index-manager.mjs'
import {
  thread_index_sync_hooks,
  start_index_sync_watcher,
  stop_index_file_watcher
} from '#libs-server/embedded-database-index/sync/start-index-sync-watcher.mjs'
import {
  start_cache_warmer,
  stop_cache_warmer
} from '#server/services/cache-warmer.mjs'
import {
  start_file_subscription_watcher,
  stop_file_subscription_watcher,
  emit_file_changed,
  emit_file_deleted
} from '#libs-server/file-subscriptions/index.mjs'
import {
  start_git_status_watcher,
  stop_git_status_watcher,
  add_repo_to_watcher,
  remove_repo_from_watcher
} from '#libs-server/file-subscriptions/git-status-watcher.mjs'
import {
  initialize_cache,
  invalidate_repo,
  invalidate_repo_list,
  destroy_cache
} from '#libs-server/git/git-status-cache.mjs'
import { get_known_repositories } from '#server/routes/git.mjs'
import { invalidate as invalidate_file_path_cache } from '#libs-server/search/file-path-cache.mjs'
import { broadcast_all } from '#server/websocket.mjs'

// Debounce file path cache invalidation so rapid file changes
// (git operations, builds) consolidate into a single invalidation
let file_path_cache_invalidation_timer = null
const debounced_invalidate_file_path_cache = () => {
  if (file_path_cache_invalidation_timer) return
  file_path_cache_invalidation_timer = setTimeout(() => {
    file_path_cache_invalidation_timer = null
    invalidate_file_path_cache()
  }, 1000)
}

const SERVER_LOCK_FILE = '.server-lock'

/**
 * Write server lock file to indicate server is running
 */
async function write_server_lock_file({ port }) {
  const lock_path = path.join(
    config.user_base_directory,
    'embedded-database-index',
    SERVER_LOCK_FILE
  )

  const lock_data = {
    pid: process.pid,
    started_at: new Date().toISOString(),
    port
  }

  try {
    // Ensure directory exists
    const dir = path.dirname(lock_path)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(lock_path, JSON.stringify(lock_data, null, 2))
  } catch (error) {
    // Non-fatal, log but continue
    debug('server')(`Failed to write lock file: ${error.message}`)
  }
}

/**
 * Remove server lock file on shutdown
 */
async function remove_server_lock_file() {
  const lock_path = path.join(
    config.user_base_directory,
    'embedded-database-index',
    SERVER_LOCK_FILE
  )

  try {
    await fs.unlink(lock_path)
  } catch (error) {
    if (error.code !== 'ENOENT') {
      debug('server')(`Failed to remove lock file: ${error.message}`)
    }
  }
}

const logger = debug('server')
debug.enable('server,api,threads:*,embedded-index*')

// Initialize embedded index (DuckDB) BEFORE accepting connections.
// This ensures thread list queries use DuckDB instead of expensive filesystem
// reads (which would read all timeline.jsonl files on first request).
let embedded_index_ready = false

try {
  logger('Initializing embedded index before server start...')
  await embedded_index_manager.initialize()
  const status = embedded_index_manager.get_index_status()
  logger(`Embedded index initialized (duckdb: ${status.duckdb_ready})`)
  embedded_index_ready = status.duckdb_ready

  if (!status.duckdb_ready) {
    logger(
      'WARNING: DuckDB not ready - queries will use slower filesystem fallback'
    )
  }
} catch (error) {
  logger(`Failed to initialize embedded index: ${error.message}`)
  logger(error)
}

try {
  const { server_port } = config
  server.listen(server_port, async () => {
    logger(`API listening on port ${server_port}`)

    // Write lock file to indicate server is running
    await write_server_lock_file({ port: server_port })

    // Initialize thread watcher after server starts
    try {
      const thread_directory = path.join(config.user_base_directory, 'thread')
      start_thread_watcher({ thread_directory })
      logger('Thread watcher initialized')
    } catch (watcher_error) {
      logger(`Failed to start thread watcher: ${watcher_error.message}`)
      logger(watcher_error)
    }

    // Initialize file subscription watcher for WebSocket notifications
    try {
      start_file_subscription_watcher({
        on_file_add: (relative_path) => {
          debounced_invalidate_file_path_cache()
          emit_file_changed(relative_path)
        },
        on_file_change: (relative_path) => {
          emit_file_changed(relative_path)
        },
        on_file_delete: (relative_path) => {
          debounced_invalidate_file_path_cache()
          emit_file_deleted(relative_path)
        }
      })
      logger('File subscription watcher initialized')
    } catch (watcher_error) {
      logger(
        `Failed to start file subscription watcher: ${watcher_error.message}`
      )
      logger(watcher_error)
    }

    // Initialize git status cache (populates in-memory cache for fast /status/all)
    try {
      await initialize_cache({
        discover_repos: get_known_repositories,
        on_repo_list_changed: ({ added, removed }) => {
          for (const repo_path of added) {
            add_repo_to_watcher(repo_path)
          }
          for (const repo_path of removed) {
            remove_repo_from_watcher(repo_path)
          }
        }
      })
      logger('Git status cache initialized')
    } catch (cache_error) {
      logger(`Failed to initialize git status cache: ${cache_error.message}`)
      logger(cache_error)
    }

    // Initialize git status watcher for broadcasting changes via WebSocket
    try {
      await start_git_status_watcher({
        on_git_status_change: async ({ repo_path }) => {
          // Update cache FIRST, then broadcast to clients
          await invalidate_repo(repo_path)
          broadcast_all({
            type: 'GIT_STATUS_CHANGED',
            payload: { repo_path }
          })
        },
        on_repo_list_change: async () => {
          await invalidate_repo_list()
        }
      })
      logger('Git status watcher initialized')
    } catch (watcher_error) {
      logger(`Failed to start git status watcher: ${watcher_error.message}`)
      logger(watcher_error)
    }

    // Initialize job worker for thread creation queue
    try {
      await start_worker()
      const max_concurrent = config.threads?.queue?.max_concurrent_jobs || 3
      logger(`Job worker initialized with concurrency: ${max_concurrent}`)
    } catch (worker_error) {
      logger(`Failed to start job worker: ${worker_error.message}`)
      logger(worker_error)
    }

    // Start entity file watcher for database sync
    if (embedded_index_ready) {
      const index_config = embedded_index_manager.get_index_config()
      if (index_config.file_watcher_enabled) {
        try {
          start_index_sync_watcher()
          logger('Entity file watcher started')
        } catch (error) {
          logger(`Failed to start entity file watcher: ${error.message}`)
        }
      }
    }

    // Start cache warmer after embedded index (can now use DuckDB for reads)
    try {
      await start_cache_warmer()
      logger('Cache warmer service started')
    } catch (error) {
      logger(`Failed to start cache warmer: ${error.message}`)
      logger(error)
    }

    // Attach thread sync hooks to the already-running thread watcher.
    // Thread changes are synced directly to DuckDB.
    if (embedded_index_ready) {
      try {
        set_thread_watcher_hooks(thread_index_sync_hooks)
        logger('Thread index sync hooks attached')
      } catch (hook_error) {
        logger(`Failed to set thread index sync hooks: ${hook_error.message}`)
        logger(hook_error)
      }
    }
  })
} catch (err) {
  // Output to stderr for visibility to operators and container orchestration
  console.error('Fatal error starting server:', err)
  process.exit(1)
}

// Graceful shutdown handlers
const shutdown = async (signal) => {
  logger(`Received ${signal}, shutting down gracefully...`)

  // Force exit timeout - ensures process terminates even if shutdown hangs
  const force_exit_timer = setTimeout(() => {
    console.error('Forcing shutdown after timeout')
    process.exit(1)
  }, 10000)

  try {
    // Stop services in order, with independent services running in parallel where safe
    // Phase 1: Stop workers and watchers (can run in parallel)
    await Promise.allSettled([
      (async () => {
        try {
          await stop_worker()
          logger('Job worker stopped')
        } catch (error) {
          logger(`Error stopping job worker: ${error.message}`)
        }
      })(),
      (async () => {
        try {
          await stop_thread_watcher()
          logger('Thread watcher stopped')
        } catch (error) {
          logger(`Error stopping thread watcher: ${error.message}`)
        }
      })(),
      (async () => {
        try {
          await stop_file_subscription_watcher()
          clearTimeout(file_path_cache_invalidation_timer)
          file_path_cache_invalidation_timer = null
          logger('File subscription watcher stopped')
        } catch (error) {
          logger(`Error stopping file subscription watcher: ${error.message}`)
        }
      })(),
      (async () => {
        try {
          await stop_git_status_watcher()
          logger('Git status watcher stopped')
        } catch (error) {
          logger(`Error stopping git status watcher: ${error.message}`)
        }
      })(),
      (async () => {
        try {
          await stop_index_file_watcher()
          logger('Entity file watcher stopped')
        } catch (error) {
          logger(`Error stopping entity file watcher: ${error.message}`)
        }
      })()
    ])

    // Phase 2: Cleanup caches and embedded index (sequential - may depend on watchers being stopped)
    try {
      destroy_cache()
      logger('Git status cache destroyed')
    } catch (error) {
      logger(`Error destroying git status cache: ${error.message}`)
    }

    try {
      await embedded_index_manager.shutdown()
      logger('Embedded index shut down')
    } catch (error) {
      logger(`Error shutting down embedded index: ${error.message}`)
    }

    try {
      await remove_server_lock_file()
      logger('Server lock file removed')
    } catch (error) {
      logger(`Error removing lock file: ${error.message}`)
    }

    try {
      stop_cache_warmer()
      logger('Cache warmer service stopped')
    } catch (error) {
      logger(`Error stopping cache warmer: ${error.message}`)
    }
  } finally {
    // Always close server and clear timeout
    clearTimeout(force_exit_timer)
    server.close(() => {
      logger('Server closed')
      process.exit(0)
    })
  }
}

// Register shutdown handlers
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
