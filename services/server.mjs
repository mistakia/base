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
  start_index_sync_watcher,
  stop_index_file_watcher,
  thread_index_sync_hooks
} from '#libs-server/embedded-database-index/sync/start-index-sync-watcher.mjs'
import {
  start_sync_trigger_watcher,
  stop_sync_trigger_watcher
} from '#libs-server/embedded-database-index/sync/sync-trigger-handler.mjs'
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

    // Initialize embedded index first (DuckDB must be ready before cache warmer)
    // Cache warmer uses DuckDB for fast queries; without it, falls back to
    // expensive filesystem reads (reads all timeline.jsonl files)
    let embedded_index_ready = false

    try {
      await embedded_index_manager.initialize()
      const status = embedded_index_manager.get_index_status()
      logger(
        `Embedded index initialized (kuzu: ${status.kuzu_ready}, duckdb: ${status.duckdb_ready})`
      )
      // Only mark ready if at least one database is actually initialized
      embedded_index_ready = status.kuzu_ready || status.duckdb_ready

      // Warn if DuckDB specifically failed (cache warmer depends on it for fast queries)
      if (!status.duckdb_ready) {
        logger(
          'WARNING: DuckDB not ready - cache warmer will use slower filesystem fallback'
        )
      }
    } catch (error) {
      logger(`Failed to initialize embedded index: ${error.message}`)
      logger(error)
    }

    // Start cache warmer after embedded index (can now use DuckDB)
    try {
      await start_cache_warmer()
      logger('Cache warmer service started')
    } catch (error) {
      logger(`Failed to start cache warmer: ${error.message}`)
      logger(error)
    }

    // Start index file watcher for database sync (only if index initialized successfully)
    if (embedded_index_ready) {
      try {
        const index_config = embedded_index_manager._get_index_config()
        if (index_config.enabled && index_config.file_watcher_enabled) {
          start_index_sync_watcher()
          // Attach thread index sync hooks to the already-running thread watcher
          // so thread/ events trigger both WebSocket emission and database sync
          // from a single chokidar instance
          set_thread_watcher_hooks(thread_index_sync_hooks)
          logger('Index file watcher started (thread hooks attached)')
        }
      } catch (watcher_error) {
        logger(`Failed to start index file watcher: ${watcher_error.message}`)
        logger(watcher_error)
      }

      // Start sync trigger watcher for CLI-triggered syncs
      try {
        start_sync_trigger_watcher({
          on_sync_request: async (request) => {
            logger(
              `Processing sync request: ${request.request_id} (type: ${request.type})`
            )
            return await embedded_index_manager.perform_sync({
              mode: request.type
            })
          }
        })
        logger('Sync trigger watcher started')
      } catch (trigger_error) {
        logger(`Failed to start sync trigger watcher: ${trigger_error.message}`)
        logger(trigger_error)
      }
    }
  })
} catch (err) {
  // TODO move to stderr
  logger(err)
}

// Graceful shutdown handlers
const shutdown = async (signal) => {
  logger(`Received ${signal}, shutting down gracefully...`)

  try {
    // Stop job worker
    await stop_worker()
    logger('Job worker stopped')
  } catch (error) {
    logger(`Error stopping job worker: ${error.message}`)
  }

  try {
    // Stop thread watcher
    await stop_thread_watcher()
    logger('Thread watcher stopped')
  } catch (error) {
    logger(`Error stopping thread watcher: ${error.message}`)
  }

  try {
    // Stop sync trigger watcher
    await stop_sync_trigger_watcher()
    logger('Sync trigger watcher stopped')
  } catch (error) {
    logger(`Error stopping sync trigger watcher: ${error.message}`)
  }

  try {
    // Stop index file watcher
    await stop_index_file_watcher()
    logger('Index file watcher stopped')
  } catch (error) {
    logger(`Error stopping index file watcher: ${error.message}`)
  }

  try {
    // Stop file subscription watcher
    await stop_file_subscription_watcher()
    clearTimeout(file_path_cache_invalidation_timer)
    file_path_cache_invalidation_timer = null
    logger('File subscription watcher stopped')
  } catch (error) {
    logger(`Error stopping file subscription watcher: ${error.message}`)
  }

  try {
    // Stop git status watcher
    await stop_git_status_watcher()
    logger('Git status watcher stopped')
  } catch (error) {
    logger(`Error stopping git status watcher: ${error.message}`)
  }

  try {
    // Destroy git status cache
    destroy_cache()
    logger('Git status cache destroyed')
  } catch (error) {
    logger(`Error destroying git status cache: ${error.message}`)
  }

  try {
    // Shutdown embedded index
    await embedded_index_manager.shutdown()
    logger('Embedded index shut down')
  } catch (error) {
    logger(`Error shutting down embedded index: ${error.message}`)
  }

  try {
    // Remove server lock file
    await remove_server_lock_file()
    logger('Server lock file removed')
  } catch (error) {
    logger(`Error removing lock file: ${error.message}`)
  }

  try {
    // Stop cache warmer service
    stop_cache_warmer()
    logger('Cache warmer service stopped')
  } catch (error) {
    logger(`Error stopping cache warmer: ${error.message}`)
  }

  // Close server
  server.close(() => {
    logger('Server closed')
    process.exit(0)
  })

  // Force exit after 10 seconds if server hasn't closed
  setTimeout(() => {
    logger('Forcing shutdown after timeout')
    process.exit(1)
  }, 10000)
}

// Register shutdown handlers
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
