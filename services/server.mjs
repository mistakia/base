import '../polyfills/node25-slow-buffer.cjs'
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
import {
  start_worker,
  stop_worker
} from '#server/services/threads/job-worker.mjs'
import embedded_index_manager from '#libs-server/embedded-database-index/embedded-index-manager.mjs'
import {
  thread_index_sync_hooks,
  start_index_sync_watcher,
  stop_index_file_watcher,
  handle_entity_file_change,
  handle_entity_file_delete
} from '#libs-server/embedded-database-index/sync/start-index-sync-watcher.mjs'
import {
  start_cache_warmer,
  stop_cache_warmer,
  invalidate_tasks_cache
} from '#server/services/cache-warmer.mjs'
import { set_watcher_status } from '#libs-server/watcher-state.mjs'
import {
  start_file_subscription_watcher,
  stop_file_subscription_watcher,
  emit_file_changed,
  emit_file_deleted
} from '#server/services/file-subscriptions/file-watcher.mjs'
import {
  start_git_status_watcher,
  stop_git_status_watcher,
  add_repo_to_watcher,
  remove_repo_from_watcher,
  handle_external_repo_file_event
} from '#libs-server/file-subscriptions/git-status-watcher.mjs'
import {
  start_user_base_watcher,
  stop_user_base_watcher
} from '#libs-server/file-subscriptions/user-base-watcher.mjs'
import {
  initialize_cache,
  get_cached_status_all,
  invalidate_repo,
  invalidate_repo_list,
  destroy_cache
} from '#libs-server/git/git-status-cache.mjs'
import { get_known_repositories } from '#server/routes/git.mjs'
import { invalidate as invalidate_file_path_cache } from '#libs-server/search/file-path-cache.mjs'
import {
  initialize_embedding_pipeline,
  handle_embedding_file_change,
  handle_embedding_file_delete
} from '#libs-server/search/embedding-pipeline.mjs'
import { broadcast_authenticated } from '#server/websocket.mjs'
import {
  discover_extensions,
  get_extension_paths
} from '#libs-server/extension/discover-extensions.mjs'
import { load_extension_providers } from '#libs-server/extension/load-extension-providers.mjs'

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

// Initialize embedded index (SQLite) BEFORE accepting connections.
// This ensures thread list queries use SQLite instead of expensive filesystem
// reads (which would read all timeline.jsonl files on first request).
let embedded_index_ready = false

try {
  logger('Initializing embedded index before server start...')
  await embedded_index_manager.initialize()
  const status = embedded_index_manager.get_index_status()
  logger(`Embedded index initialized (sqlite: ${status.sqlite_ready})`)
  embedded_index_ready = status.sqlite_ready

  if (!status.sqlite_ready) {
    logger(
      'WARNING: SQLite not ready - queries will use slower filesystem fallback'
    )
  }
} catch (error) {
  logger(`Failed to initialize embedded index: ${error.message}`)
  logger(error)
}

// Pre-warm git status cache BEFORE server starts accepting connections.
// This eliminates 600ms+ cold start delay on first git status request.
try {
  logger('Pre-warming git status cache before server start...')
  await initialize_cache({
    discover_repos: get_known_repositories
  })
  logger('Git status cache pre-warmed')
} catch (error) {
  logger(`Failed to pre-warm git status cache: ${error.message}`)
  logger(error)
}

// Discover extensions and load capability providers before accepting connections.
// Server routes that consume capabilities import from the registry.
try {
  const extensions = discover_extensions(get_extension_paths(config))
  await load_extension_providers(extensions)
  logger(`Extension providers loaded (${extensions.length} extensions discovered)`)
} catch (error) {
  logger(`Failed to load extension providers: ${error.message}`)
}

try {
  const { server_port, server_host } = config
  server.listen(server_port, server_host, async () => {
    logger(`API listening on ${server_host}:${server_port}`)

    // Write lock file to indicate server is running
    await write_server_lock_file({ port: server_port })

    const file_watcher_config = config.file_watchers || {}

    // Sequential watcher initialization: start watchers one at a time,
    // waiting for each to be ready before starting the next.
    // Order: thread watcher -> file subscription -> git status (prioritize thread watcher for index sync)

    // 1. Thread watcher (drives index sync, start first)
    if (file_watcher_config.thread_watcher_enabled !== false) {
      try {
        const start_time = Date.now()
        const thread_directory = path.join(config.user_base_directory, 'thread')
        await start_thread_watcher({
          thread_directory
        })
        set_watcher_status('thread_watcher', 'ready')
        logger(`Thread watcher initialized (${Date.now() - start_time}ms)`)
      } catch (watcher_error) {
        set_watcher_status('thread_watcher', 'failed')
        logger(`Failed to start thread watcher: ${watcher_error.message}`)
        logger(watcher_error)
      }
    } else {
      set_watcher_status('thread_watcher', 'disabled')
      logger('Thread watcher disabled by config')
    }

    // 2. File subscription watcher (WebSocket entity notifications -- setup only)
    if (file_watcher_config.file_subscriptions_enabled !== false) {
      try {
        start_file_subscription_watcher()
        set_watcher_status('file_subscription_watcher', 'ready')
        logger(
          'File subscription watcher initialized (watching via user-base-watcher)'
        )
      } catch (watcher_error) {
        set_watcher_status('file_subscription_watcher', 'failed')
        logger(
          `Failed to start file subscription watcher: ${watcher_error.message}`
        )
        logger(watcher_error)
      }
    } else {
      set_watcher_status('file_subscription_watcher', 'disabled')
      logger('File subscription watcher disabled by config')
    }

    // 3. Git status cache callbacks (cache was pre-warmed before server start)
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
      logger('Git status cache callbacks configured')
    } catch (cache_error) {
      logger(`Failed to configure git status cache: ${cache_error.message}`)
      logger(cache_error)
    }

    // 4. Git status watcher (broadcasting changes via WebSocket)
    if (file_watcher_config.git_status_watcher_enabled !== false) {
      try {
        const start_time = Date.now()
        const { repo_paths } = get_cached_status_all()
        const git_watcher = await start_git_status_watcher({
          repo_paths,
          on_git_status_change: async ({ repo_path }) => {
            await invalidate_repo(repo_path)
            broadcast_authenticated({
              type: 'GIT_STATUS_CHANGED',
              payload: { repo_path }
            })
          },
          on_repo_list_change: async () => {
            await invalidate_repo_list()
          }
        })
        if (git_watcher) {
          set_watcher_status('git_status_watcher', 'ready')
          logger(
            `Git status watcher initialized (${Date.now() - start_time}ms)`
          )
        } else {
          set_watcher_status('git_status_watcher', 'failed')
          logger('Git status watcher returned null, marking as failed')
        }
      } catch (watcher_error) {
        set_watcher_status('git_status_watcher', 'failed')
        logger(`Failed to start git status watcher: ${watcher_error.message}`)
        logger(watcher_error)
      }
    } else {
      set_watcher_status('git_status_watcher', 'disabled')
      logger('Git status watcher disabled by config')
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
          start_index_sync_watcher({ on_task_change: invalidate_tasks_cache })
          set_watcher_status('entity_file_watcher', 'ready')
          logger('Entity file watcher started')
        } catch (error) {
          set_watcher_status('entity_file_watcher', 'failed')
          logger(`Failed to start entity file watcher: ${error.message}`)
        }
      } else {
        set_watcher_status('entity_file_watcher', 'disabled')
      }
    } else {
      set_watcher_status('entity_file_watcher', 'disabled')
    }

    // Initialize embedding pipeline for semantic search (non-blocking background sync)
    if (embedded_index_ready) {
      try {
        initialize_embedding_pipeline({
          user_base_directory: config.user_base_directory
        })
        logger('Embedding pipeline initialized')
      } catch (error) {
        logger(`Failed to initialize embedding pipeline: ${error.message}`)
      }
    }

    // Start cache warmer after embedded index (can now use SQLite for reads)
    try {
      await start_cache_warmer()
      logger('Cache warmer service started')
    } catch (error) {
      logger(`Failed to start cache warmer: ${error.message}`)
      logger(error)
    }

    // Attach thread sync hooks to the already-running thread watcher.
    // Thread changes are synced directly to SQLite.
    if (embedded_index_ready) {
      try {
        set_thread_watcher_hooks(thread_index_sync_hooks)
        logger('Thread index sync hooks attached')
      } catch (hook_error) {
        logger(`Failed to set thread index sync hooks: ${hook_error.message}`)
        logger(hook_error)
      }
    }

    // Start consolidated user-base watcher (replaces chokidar instances for
    // file subscriptions, entity index sync, and repo file watching)
    try {
      const start_time = Date.now()
      await start_user_base_watcher({
        user_base_directory: config.user_base_directory,
        file_subscription:
          file_watcher_config.file_subscriptions_enabled !== false
            ? {
                on_add: (relative_path) => {
                  debounced_invalidate_file_path_cache()
                  emit_file_changed(relative_path)
                },
                on_change: (relative_path) => {
                  emit_file_changed(relative_path)
                },
                on_delete: (relative_path) => {
                  debounced_invalidate_file_path_cache()
                  emit_file_deleted(relative_path)
                }
              }
            : null,
        entity_index: embedded_index_ready
          ? {
              on_change: (file_path) => {
                handle_entity_file_change(file_path)
                handle_embedding_file_change(file_path)
              },
              on_delete: (file_path) => {
                handle_entity_file_delete(file_path)
                handle_embedding_file_delete(file_path).catch((error) => {
                  logger(
                    `Embedding delete failed for ${file_path}: ${error.message}`
                  )
                })
              }
            }
          : null,
        repo_file:
          file_watcher_config.git_status_watcher_enabled !== false
            ? { on_change: handle_external_repo_file_event }
            : null
      })
      set_watcher_status('user_base_watcher', 'ready')
      logger(`User-base watcher initialized (${Date.now() - start_time}ms)`)
    } catch (watcher_error) {
      set_watcher_status('user_base_watcher', 'failed')
      logger(`Failed to start user-base watcher: ${watcher_error.message}`)
      logger(watcher_error)
    }

    logger('All watchers initialized')
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
          await stop_user_base_watcher()
          logger('User-base watcher stopped')
        } catch (error) {
          logger(`Error stopping user-base watcher: ${error.message}`)
        }
      })(),
      (async () => {
        try {
          stop_index_file_watcher()
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
