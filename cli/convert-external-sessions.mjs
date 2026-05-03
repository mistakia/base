#!/usr/bin/env bun

/**
 * Convert External Sessions Script
 *
 * Command-line script to convert external AI chat sessions from multiple providers
 * (Claude Code, Cursor) into Base execution threads with complete timeline preservation.
 */

import fs_sync from 'fs'
import os from 'os'
import path from 'path'
import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import { isMain } from '#libs-server/is-main.mjs'
import { get_cursor_config } from '#libs-server/integrations/cursor/cursor-config.mjs'
import { build_chatgpt_filter } from '#libs-server/integrations/chatgpt/chatgpt-config.mjs'
import { build_session_filter } from '#libs-server/integrations/thread/thread-integration-shared-config.mjs'
import { get_user_base_directory } from '#libs-server/base-uri/base-directory-registry.mjs'

// Claude integration
import {
  import_claude_sessions_to_threads,
  list_claude_sessions
} from '#libs-server/integrations/claude/index.mjs'
import {
  get_unsupported_summary as get_claude_unsupported,
  clear_unsupported_tracking as clear_claude_unsupported
} from '#libs-server/integrations/claude/normalize-session.mjs'

// Cursor integration
import {
  import_cursor_conversations_to_threads,
  list_cursor_conversations
} from '#libs-server/integrations/cursor/index.mjs'
import {
  get_unsupported_summary as get_cursor_unsupported,
  clear_unsupported_tracking as clear_cursor_unsupported
} from '#libs-server/integrations/cursor/normalize-session.mjs'

// ChatGPT integration
import {
  import_chatgpt_conversations_to_threads,
  list_chatgpt_conversations
} from '#libs-server/integrations/chatgpt/index.mjs'
import {
  get_unsupported_summary as get_chatgpt_unsupported,
  clear_unsupported_tracking as clear_chatgpt_unsupported
} from '#libs-server/integrations/chatgpt/normalize-session.mjs'

// Pi integration
import {
  list_pi_sessions,
  import_pi_sessions,
  link_pi_branches,
  get_pi_unsupported,
  clear_pi_unsupported
} from '#libs-server/integrations/pi/index.mjs'

const log = debug('convert-external-sessions')

function parse_json_arg(value, arg_name) {
  try {
    return JSON.parse(value)
  } catch (e) {
    console.error(`Invalid JSON in ${arg_name}: ${e.message}`)
    process.exit(1)
  }
}

/**
 * Setup debug logging based on verbose and debug flags
 * @param {Object} params
 * @param {boolean} params.verbose - enable high-level progress logs
 * @param {boolean} params.debug_flag - enable deep module debug logs
 */
function setup_debug_logging({ verbose, debug_flag }) {
  const verbose_namespaces = [
    'convert-external-sessions',
    // high-level provider namespaces
    'integrations:claude',
    'integrations:cursor',
    'integrations:chatgpt',
    'integrations:pi',
    'integrations:thread',
    'integrations:thread:create-from-session-provider',
    'integrations:thread:create-from-session'
  ].join(',')

  // exclude any :debug postfix when in verbose-only mode using debug's negate pattern
  const verbose_exclude_debug = '-*:debug'

  const debug_namespaces = [
    // everything under integrations including :debug
    'integrations:*',
    // include cli logger
    'convert-external-sessions'
  ].join(',')

  if (verbose && debug_flag) {
    debug.enable(`${verbose_namespaces},${debug_namespaces}`)
  } else if (verbose) {
    debug.enable(`${verbose_namespaces},${verbose_exclude_debug}`)
  } else if (debug_flag) {
    debug.enable(debug_namespaces)
  } else {
    // Disable debug output for quiet mode
    debug.enabled = () => false
  }
}

/**
 * Output minimal information for quiet mode
 * @param {Object} result - Import results
 * @param {Object} argv - Command line arguments
 */
function output_quiet(result, argv) {
  // Show thread IDs for all processed sessions (created, updated, skipped)
  if (result.results?.created?.length > 0) {
    result.results.created.forEach((thread) => {
      console.log(`${thread.thread_id} (created)`)
    })
  }

  if (result.results?.updated?.length > 0) {
    result.results.updated.forEach((thread) => {
      console.log(`${thread.thread_id} (updated)`)
    })
  }

  if (result.results?.skipped?.length > 0) {
    result.results.skipped.forEach((thread) => {
      const id = thread.thread_id || thread.session_id || thread.composer_id
      const reason = thread.reason ? `: ${thread.reason}` : ''
      console.log(`${id} (skipped${reason})`)
    })
  }

  // Show failures with session IDs
  if (result.results?.failed?.length > 0) {
    result.results.failed.forEach((failure) => {
      const id = failure.session_id || failure.composer_id
      console.log(`${id} (failed: ${failure.error})`)
    })
  }
}

/**
 * Format error message with additional context and helpful hints
 * @param {string} error - Original error message
 * @param {string} sessionId - Session identifier
 * @param {string} provider - Provider name (claude, cursor, chatgpt)
 * @returns {string} Enhanced error message
 */
function format_error_message(error, sessionId, provider) {
  if (
    error.toLowerCase().includes('not found') ||
    error.toLowerCase().includes('does not exist')
  ) {
    if (provider === 'claude') {
      return `${error}\n    Hint: Check if file ${sessionId}.jsonl exists in Claude projects directory`
    } else if (provider === 'cursor') {
      return `${error}\n    Hint: Verify session exists in Cursor database`
    } else if (provider === 'chatgpt') {
      return `${error}\n    Hint: Check ChatGPT authentication or conversation access`
    }
  }

  if (
    error.toLowerCase().includes('parse') ||
    error.toLowerCase().includes('invalid')
  ) {
    return `${error}\n    Hint: Run with --verbose for detailed parsing information`
  }

  if (
    error.toLowerCase().includes('permission') ||
    error.toLowerCase().includes('access')
  ) {
    return `${error}\n    Hint: Check file permissions or authentication credentials`
  }

  // Default: suggest verbose mode for other errors
  return `${error}\n    Hint: Use --verbose flag for more detailed error information`
}

/**
 * Output session list with appropriate verbosity
 * @param {Array} sessions - Array of sessions
 * @param {Object} argv - Command line arguments
 */
function output_session_list(sessions, argv) {
  if (argv.verbose) {
    console.log(`\nFound ${sessions.length} ${argv.provider} sessions:\n`)

    sessions.forEach((session, index) => {
      console.log(
        `${index + 1}. Session: ${session.session_id || session.composer_id}`
      )

      if (argv.provider === 'claude') {
        console.log(`   File: ${session.file_source}`)
        console.log(`   Entries: ${session.entry_count}`)
        console.log(
          `   Duration: ${session.duration_minutes?.toFixed(1) || 'unknown'} minutes`
        )
        console.log(`   Working Dir: ${session.working_directory}`)
        console.log(
          `   Time: ${session.start_time?.toLocaleString() || 'unknown'} - ${session.end_time?.toLocaleString() || 'unknown'}`
        )

        if (session.summaries?.length > 0) {
          console.log('   Summaries:')
          session.summaries.slice(0, 3).forEach((summary) => {
            console.log(`     • ${summary}`)
          })
          if (session.summaries.length > 3) {
            console.log(`     ... and ${session.summaries.length - 3} more`)
          }
        }
      } else if (argv.provider === 'cursor') {
        console.log(`   Messages: ${session.message_count}`)
        console.log(
          `   Duration: ${session.duration_minutes?.toFixed(1) || 'unknown'} minutes`
        )
        console.log(
          `   Created: ${session.created_at ? new Date(session.created_at).toLocaleString() : 'unknown'}`
        )
        console.log(
          `   Updated: ${session.last_updated_at ? new Date(session.last_updated_at).toLocaleString() : 'unknown'}`
        )

        if (session.summary) {
          console.log(`   Summary: ${session.summary}`)
        }
        console.log(`   Code blocks: ${session.has_code_blocks ? 'Yes' : 'No'}`)
        console.log(`   Model: ${session.model_used}`)
      } else if (argv.provider === 'pi') {
        console.log(`   Project: ${session.project_path}`)
        console.log(`   File: ${session.file_path}`)
        console.log(`   Version: ${session.version}`)
        console.log(`   Branches: ${session.branch_count}`)
        console.log(`   Entries: ${session.entry_count}`)
      } else if (argv.provider === 'chatgpt') {
        console.log(`   Title: ${session.title}`)
        console.log(
          `   Created: ${session.created_at ? new Date(session.created_at).toLocaleString() : 'unknown'}`
        )
        console.log(
          `   Updated: ${session.updated_at ? new Date(session.updated_at).toLocaleString() : 'unknown'}`
        )
        console.log(`   Archived: ${session.is_archived ? 'Yes' : 'No'}`)
        console.log(`   Starred: ${session.is_starred ? 'Yes' : 'No'}`)
        console.log(`   Memory: ${session.memory_scope || 'none'}`)
        if (session.gizmo_id) {
          console.log(`   GPT: ${session.gizmo_id}`)
        }
      }

      console.log()
    })
  } else {
    // Quiet mode: show summary count and session IDs only
    console.log(`${sessions.length}`)
    sessions.forEach((session) => {
      console.log(session.session_id || session.composer_id)
    })
  }
}

/**
 * Output detailed information for verbose mode
 * @param {Object} result - Import results
 * @param {Object} argv - Command line arguments
 */
function output_verbose(result, argv) {
  console.log('\n=== Import Results ===')

  if (argv.provider === 'claude') {
    console.log(`Sessions found: ${result.sessions_found}`)
    console.log(`Valid sessions: ${result.valid_sessions}`)
    console.log(`Invalid sessions: ${result.invalid_sessions}`)

    // Show agent merging statistics
    if (result.agents_merged !== undefined) {
      console.log(`Agents merged: ${result.agents_merged}`)
    }
    if (result.warm_agents_excluded !== undefined) {
      console.log(`Warm agents excluded: ${result.warm_agents_excluded}`)
    }
  } else if (argv.provider === 'pi') {
    console.log(`Sessions found: ${result.sessions_found}`)
    console.log(`Branches found: ${result.branches_found ?? result.valid_sessions}`)
    console.log(`Valid sessions: ${result.valid_sessions}`)
    console.log(`Invalid sessions: ${result.invalid_sessions}`)
    if (result.linker_summary) {
      console.log(`Linker: ${result.linker_summary.relations_added} relations, ${result.linker_summary.branch_points_resolved} branch_point entries resolved`)
    }
  } else if (argv.provider === 'cursor') {
    console.log(`Conversations found: ${result.conversations_found}`)
    console.log(`Valid conversations: ${result.valid_conversations}`)
    console.log(`Invalid conversations: ${result.invalid_conversations}`)
  } else if (argv.provider === 'chatgpt') {
    console.log(`Conversations found: ${result.conversations_found}`)
    console.log(`Conversations fetched: ${result.conversations_fetched}`)
    console.log(`Valid sessions: ${result.valid_sessions}`)
  }

  if (argv.dryRun) {
    console.log(`Would process threads: ${result.valid_sessions}`)
  } else {
    console.log(`Threads created: ${result.threads_created}`)
    if (result.threads_updated !== undefined) {
      console.log(`Threads updated: ${result.threads_updated}`)
    }
    console.log(`Threads failed: ${result.threads_failed}`)
    console.log(`Success rate: ${result.success_rate}%`)

    if (result.results?.created?.length > 0) {
      console.log('\nCreated threads:')
      result.results.created.slice(0, 5).forEach((thread) => {
        console.log(
          `  ${thread.thread_id} (${thread.timeline_entries || 'unknown'} entries)`
        )
      })
      if (result.results.created.length > 5) {
        console.log(`  ... and ${result.results.created.length - 5} more`)
      }
    }

    if (result.results?.updated?.length > 0) {
      console.log('\nUpdated threads:')
      result.results.updated.slice(0, 5).forEach((thread) => {
        console.log(
          `  ${thread.thread_id} (${thread.timeline_entries || 'unknown'} entries)`
        )
      })
      if (result.results.updated.length > 5) {
        console.log(`  ... and ${result.results.updated.length - 5} more`)
      }
    }

    if (result.results?.failed?.length > 0) {
      console.log('\nFailed threads:')
      result.results.failed.forEach((failure) => {
        const id = failure.session_id || failure.composer_id
        console.log(
          `  ${id}: ${format_error_message(failure.error, id, argv.provider)}`
        )
      })
    }
  }

  // Display unsupported features summary in verbose mode
  let unsupported
  if (argv.provider === 'claude') {
    unsupported = get_claude_unsupported()
  } else if (argv.provider === 'cursor') {
    unsupported = get_cursor_unsupported()
  } else if (argv.provider === 'chatgpt') {
    unsupported = get_chatgpt_unsupported()
  } else if (argv.provider === 'pi') {
    unsupported = get_pi_unsupported()
  }

  if (unsupported && Object.keys(unsupported).length > 0) {
    // Count total unsupported items
    const totalUnsupported = Object.values(unsupported).reduce((sum, arr) => {
      return sum + (Array.isArray(arr) ? arr.length : 0)
    }, 0)

    if (totalUnsupported === 0) {
      return // No actual unsupported features found
    }

    if (argv.verbose) {
      console.log('\n=== Unsupported Features Found ===')
      Object.entries(unsupported).forEach(([feature, items]) => {
        if (Array.isArray(items) && items.length > 0) {
          console.log(`${feature}: ${items.length} occurrences`)
          items.forEach((item) => {
            console.log(`  • ${item}`)
          })
        }
      })
      console.log('\nNote: Unsupported features are logged but not imported.')
    } else {
      console.log(
        `\nFound ${totalUnsupported} unsupported features. Use --verbose for details.`
      )
    }
  }
}

/**
 * List available sessions from a provider
 */
export async function list_sessions(options = {}) {
  const { provider = 'claude' } = options

  try {
    log(`Listing ${provider} sessions...`)

    if (provider === 'claude') {
      return await list_claude_sessions(options)
    } else if (provider === 'cursor') {
      return await list_cursor_conversations(options)
    } else if (provider === 'chatgpt') {
      return await list_chatgpt_conversations(options)
    } else if (provider === 'pi') {
      return await list_pi_sessions(options)
    } else {
      throw new Error(`Unsupported provider: ${provider}`)
    }
  } catch (error) {
    log(`Error listing ${provider} sessions: ${error.message}`)
    throw error
  }
}

/**
 * Import sessions to Base threads
 */
export async function import_sessions(options = {}) {
  const { provider = 'claude' } = options

  try {
    log(
      options.dry_run
        ? `Running dry run analysis for ${provider}...`
        : `Starting ${provider} session import...`
    )

    if (provider === 'claude') {
      const filter_sessions = build_session_filter({
        ...options,
        user_base_directory: options.user_base_directory
      })

      return await import_claude_sessions_to_threads({
        ...options,
        filter_sessions
      })
    } else if (provider === 'cursor') {
      const filter_conversations = build_session_filter({
        ...options,
        user_base_directory: options.user_base_directory
      })

      return await import_cursor_conversations_to_threads({
        ...options,
        filter_conversations
      })
    } else if (provider === 'chatgpt') {
      const filter_conversations = build_chatgpt_filter(options)

      return await import_chatgpt_conversations_to_threads({
        ...options,
        filter_conversations
      })
    } else if (provider === 'pi') {
      const result = await import_pi_sessions(options)
      if (!options.dry_run && !options.skip_branch_linking) {
        const created = result.results?.created || []
        const updated = result.results?.updated || []
        const linker_summary = await link_pi_branches({
          thread_results: created.concat(updated)
        })
        result.linker_summary = linker_summary
      }
      return result
    } else {
      throw new Error(`Unsupported provider: ${provider}`)
    }
  } catch (error) {
    log(`Error importing ${provider} sessions: ${error.message}`)
    throw error
  }
}

/**
 * Validate session files
 */
export async function validate_sessions(options = {}) {
  const { provider = 'claude' } = options

  try {
    log(`Validating ${provider} session files...`)

    return await import_sessions({
      ...options,
      dry_run: true,
      verbose: true
    })
  } catch (error) {
    log(`Error validating ${provider} sessions: ${error.message}`)
    throw error
  }
}

// Command-line interface
const main = async () => {
  try {
    await yargs(hideBin(process.argv))
      .command(
        'list',
        'List available sessions from a provider',
        (yargs) => {
          return yargs
            .option('provider', {
              alias: 'p',
              describe: 'Session provider',
              choices: ['claude', 'cursor', 'chatgpt', 'pi'],
              default: 'claude'
            })
            .option('claude-projects-dir', {
              describe:
                'Claude projects directory (overrides multi-account discovery from claude_accounts.accounts[])',
              type: 'string'
            })
            .option('cursor-db-path', {
              describe: 'Cursor database path',
              type: 'string',
              default: get_cursor_config().cursor_data_path
            })
            .option('chatgpt-bearer-token', {
              describe: 'ChatGPT JWT Bearer token for authentication',
              type: 'string'
            })
            .option('chatgpt-session-cookies', {
              describe: 'ChatGPT session cookies (JSON string)',
              type: 'string'
            })
            .option('chatgpt-device-id', {
              describe: 'ChatGPT device ID',
              type: 'string'
            })
            .option('pi-sessions-dir', {
              describe: 'Pi sessions directory (defaults to ~/.pi/agent/sessions)',
              type: 'string'
            })
            .option('pi-sessions-dirs', {
              describe: 'Multiple Pi sessions directories (comma-separated)',
              type: 'string'
            })
            .option('verbose', {
              alias: 'v',
              describe: 'Verbose output',
              type: 'boolean',
              default: false
            })
            .option('debug', {
              describe: 'Enable deep module debug logging',
              type: 'boolean',
              default: false
            })
        },
        async (argv) => {
          setup_debug_logging({ verbose: argv.verbose, debug_flag: argv.debug })

          // Clear unsupported tracking for fresh analysis
          clear_claude_unsupported()
          clear_cursor_unsupported()
          clear_chatgpt_unsupported()
          clear_pi_unsupported()

          // Build ChatGPT auth object if provider is ChatGPT
          let chatgpt_auth = {}
          if (argv.provider === 'chatgpt') {
            if (
              !argv.chatgptBearerToken ||
              !argv.chatgptSessionCookies ||
              !argv.chatgptDeviceId
            ) {
              throw new Error(
                'ChatGPT provider requires --chatgpt-bearer-token, --chatgpt-session-cookies, and --chatgpt-device-id'
              )
            }

            chatgpt_auth = {
              bearer_token: argv.chatgptBearerToken,
              session_cookies: parse_json_arg(
                argv.chatgptSessionCookies,
                '--chatgpt-session-cookies'
              ),
              device_id: argv.chatgptDeviceId
            }
          }

          const sessions = await list_sessions({
            provider: argv.provider,
            claude_projects_directory: argv.claudeProjectsDir,
            cursor_db_path: argv.cursorDbPath,
            chatgpt_auth,
            pi_sessions_dir: argv.piSessionsDir,
            pi_sessions_dirs: argv.piSessionsDirs,
            verbose: argv.verbose
          })

          output_session_list(sessions, argv)
        }
      )
      .command(
        'import',
        'Import sessions as Base threads',
        (yargs) => {
          return yargs
            .option('provider', {
              alias: 'p',
              describe: 'Session provider',
              choices: ['claude', 'cursor', 'chatgpt', 'pi'],
              default: 'claude'
            })
            .option('claude-projects-dir', {
              describe:
                'Claude projects directory (overrides multi-account discovery from claude_accounts.accounts[])',
              type: 'string'
            })
            .option('cursor-db-path', {
              describe: 'Cursor database path',
              type: 'string',
              default: get_cursor_config().cursor_data_path
            })
            .option('chatgpt-bearer-token', {
              describe: 'ChatGPT JWT Bearer token for authentication',
              type: 'string'
            })
            .option('chatgpt-session-cookies', {
              describe: 'ChatGPT session cookies (JSON string)',
              type: 'string'
            })
            .option('chatgpt-device-id', {
              describe: 'ChatGPT device ID',
              type: 'string'
            })
            .option('debug', {
              describe: 'Enable deep module debug logging',
              type: 'boolean',
              default: false
            })
            .option('user-base-dir', {
              alias: 'u',
              describe: 'User base directory',
              type: 'string',
              default: get_user_base_directory()
            })
            .option('session-id', {
              describe: 'Import specific session ID only',
              type: 'string'
            })
            .option('session-file', {
              describe: 'Import from specific JSONL file path (absolute path)',
              type: 'string'
            })
            .option('allow-raw-data-fallback', {
              describe:
                'Allow importing from a thread/<id>/raw-data/claude-session.jsonl even if the canonical Claude source file still exists (recovery-only escape hatch). Without this flag, the canonical source under ~/.claude/projects/.../<session>.jsonl is preferred when present.',
              type: 'boolean',
              default: false
            })
            .option('from-date', {
              describe: 'Import sessions from date (YYYY-MM-DD)',
              type: 'string'
            })
            .option('from-days', {
              describe:
                'Import sessions from N days ago (alternative to --from-date, avoids shell substitution)',
              type: 'number'
            })
            .option('to-date', {
              describe: 'Import sessions to date (YYYY-MM-DD)',
              type: 'string'
            })
            .option('max-entries', {
              describe: 'Skip sessions with more than N entries/messages',
              type: 'number'
            })
            .option('max-conversations', {
              describe:
                'Maximum number of conversations to import (for ChatGPT)',
              type: 'number'
            })
            .option('dry-run', {
              describe: 'Show what would be imported without creating threads',
              type: 'boolean',
              default: false
            })
            .option('allow-updates', {
              describe: 'Allow updating existing imported threads',
              type: 'boolean',
              default: false
            })
            .option('known-thread-id', {
              describe:
                'Pre-created thread ID to update instead of creating a new thread (thread-first flow)',
              type: 'string'
            })
            .option('skip-branch-linking', {
              describe:
                'Pi only: skip post-import cross-thread branch linking (debug-only). Leaves threads in a permanently inconsistent state until linking is re-run; prefer --dry-run for safe exploration.',
              type: 'boolean',
              default: false
            })
            .option('single-leaf-only', {
              describe:
                'Pi only: yield only the active-leaf branch from --session-file (live-sync ticks). Default false to preserve bulk-import behavior.',
              type: 'boolean',
              default: false
            })
            .option('verbose', {
              alias: 'v',
              describe: 'Verbose output',
              type: 'boolean',
              default: false
            })
            .check((argv) => {
              if (argv.fromDate && argv.fromDays !== undefined) {
                throw new Error(
                  '--from-date and --from-days are mutually exclusive'
                )
              }

              // Prefer the canonical Claude source over a raw-data copy.
              // When --session-file points at thread/<id>/raw-data/claude-session.jsonl
              // but the original ~/.claude/projects/.../<session>.jsonl still
              // exists, refuse unless --allow-raw-data-fallback is explicitly
              // passed. The canonical file is append-only and contains
              // authoritative bytes; raw-data is a downstream copy that can
              // drift (missing leading entries from the deferred-sync-state
              // bug, accumulated duplicates from delta appends, merged
              // subagent entries, etc.).
              if (
                argv.provider === 'claude' &&
                argv.sessionFile &&
                !argv.allowRawDataFallback
              ) {
                const sf = String(argv.sessionFile)
                const is_raw_data_path =
                  sf.includes('/raw-data/') &&
                  sf.endsWith('claude-session.jsonl')
                if (is_raw_data_path) {
                  // Peek the first lines to recover the canonical sessionId
                  // and cwd, then look for the canonical source file.
                  let canonical_source = null
                  try {
                    const head = fs_sync
                      .readFileSync(sf, 'utf-8')
                      .split('\n')
                      .slice(0, 20)
                    const uuid_re =
                      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
                    let found_session_id = null
                    let found_cwd = null
                    for (const line of head) {
                      if (!line.trim()) continue
                      try {
                        const entry = JSON.parse(line)
                        if (
                          !found_session_id &&
                          typeof entry?.sessionId === 'string' &&
                          uuid_re.test(entry.sessionId)
                        ) {
                          found_session_id = entry.sessionId
                        }
                        if (!found_cwd && typeof entry?.cwd === 'string') {
                          found_cwd = entry.cwd
                        }
                        if (found_session_id && found_cwd) break
                      } catch {
                        /* skip malformed */
                      }
                    }
                    if (found_session_id) {
                      const home = os.homedir()
                      const cwd = found_cwd || process.cwd()
                      const project_dir = String(cwd).replace(/\//g, '-')
                      canonical_source = path.join(
                        home,
                        '.claude',
                        'projects',
                        project_dir,
                        `${found_session_id}.jsonl`
                      )
                    }
                  } catch {
                    /* unreadable -- allow import to proceed */
                  }
                  if (
                    canonical_source &&
                    fs_sync.existsSync(canonical_source)
                  ) {
                    throw new Error(
                      `Refusing to import from raw-data copy when canonical Claude source still exists:\n` +
                        `  raw-data: ${sf}\n` +
                        `  canonical: ${canonical_source}\n` +
                        `Re-run with --session-file pointing at the canonical source, or pass --allow-raw-data-fallback to override (recovery only, when the canonical file is gone).`
                    )
                  }
                }
              }

              // Compute fromDate from fromDays if provided
              if (argv.fromDays !== undefined) {
                const d = new Date()
                d.setDate(d.getDate() - argv.fromDays)
                argv.fromDate = d.toISOString().slice(0, 10)
              }

              // Validate date format if provided
              if (argv.fromDate) {
                const date = new Date(argv.fromDate)
                if (isNaN(date.getTime())) {
                  throw new Error(
                    'Invalid date format for --from-date. Use YYYY-MM-DD format'
                  )
                }
              }
              if (argv.toDate) {
                const date = new Date(argv.toDate)
                if (isNaN(date.getTime())) {
                  throw new Error(
                    'Invalid date format for --to-date. Use YYYY-MM-DD format'
                  )
                }
              }
              return true
            })
        },
        async (argv) => {
          setup_debug_logging({ verbose: argv.verbose, debug_flag: argv.debug })

          // Clear unsupported tracking for fresh analysis
          clear_claude_unsupported()
          clear_cursor_unsupported()
          clear_chatgpt_unsupported()
          clear_pi_unsupported()

          // Build ChatGPT auth object if provider is ChatGPT
          let chatgpt_auth = {}
          if (argv.provider === 'chatgpt') {
            if (
              !argv.chatgptBearerToken ||
              !argv.chatgptSessionCookies ||
              !argv.chatgptDeviceId
            ) {
              throw new Error(
                'ChatGPT provider requires --chatgpt-bearer-token, --chatgpt-session-cookies, and --chatgpt-device-id'
              )
            }

            chatgpt_auth = {
              bearer_token: argv.chatgptBearerToken,
              session_cookies: parse_json_arg(
                argv.chatgptSessionCookies,
                '--chatgpt-session-cookies'
              ),
              device_id: argv.chatgptDeviceId
            }
          }

          if (argv.dryRun) {
            console.log(
              `Dry run mode - analyzing ${argv.provider} sessions...\n`
            )
          } else {
            console.log(`Starting ${argv.provider} session import...\n`)
          }

          // Bulk-import flag exempts session-import metadata writes from the
          // field-ownership classifier. True for any historical batch import
          // (--from-date / --from-days / no-filter); false only when a single
          // --session-id is targeted (potentially a live session whose lease
          // holder still owns session-owned fields).
          const is_targeted_single_session = Boolean(argv.sessionId)
          const result = await import_sessions({
            provider: argv.provider,
            claude_projects_directory: argv.claudeProjectsDir,
            cursor_db_path: argv.cursorDbPath,
            chatgpt_auth,
            pi_sessions_dir: argv.piSessionsDir,
            pi_sessions_dirs: argv.piSessionsDirs,
            skip_branch_linking: argv.skipBranchLinking,
            single_leaf_only: argv.singleLeafOnly,
            user_base_directory: argv.userBaseDir,
            session_id: argv.sessionId,
            session_file: argv.sessionFile,
            from_date: argv.fromDate,
            to_date: argv.toDate,
            max_entries: argv.maxEntries,
            max_conversations: argv.maxConversations,
            dry_run: argv.dryRun,
            allow_updates: argv.allowUpdates,
            verbose: argv.verbose,
            known_thread_id: argv.knownThreadId,
            bulk_import: !is_targeted_single_session
          })

          // Use appropriate output format based on verbose flag
          if (argv.verbose) {
            output_verbose(result, argv)
          } else {
            output_quiet(result, argv)
          }

          // Exit with appropriate code
          if (result.results?.failed?.length > 0) {
            console.log(
              `\nCompleted with ${result.results.failed.length} errors`
            )
            process.exit(1)
          } else {
            console.log('\nImport completed successfully!')
            process.exit(0)
          }
        }
      )
      .command(
        'validate',
        'Validate session files without importing',
        (yargs) => {
          return yargs
            .option('provider', {
              alias: 'p',
              describe: 'Session provider',
              choices: ['claude', 'cursor', 'chatgpt', 'pi'],
              default: 'claude'
            })
            .option('claude-projects-dir', {
              describe:
                'Claude projects directory (overrides multi-account discovery from claude_accounts.accounts[])',
              type: 'string'
            })
            .option('cursor-db-path', {
              describe: 'Cursor database path',
              type: 'string',
              default: get_cursor_config().cursor_data_path
            })
            .option('chatgpt-bearer-token', {
              describe: 'ChatGPT JWT Bearer token for authentication',
              type: 'string'
            })
            .option('chatgpt-session-cookies', {
              describe: 'ChatGPT session cookies (JSON string)',
              type: 'string'
            })
            .option('chatgpt-device-id', {
              describe: 'ChatGPT device ID',
              type: 'string'
            })
            .option('pi-sessions-dir', {
              describe: 'Pi sessions directory (defaults to ~/.pi/agent/sessions)',
              type: 'string'
            })
            .option('pi-sessions-dirs', {
              describe: 'Multiple Pi sessions directories (comma-separated)',
              type: 'string'
            })
            .option('verbose', {
              alias: 'v',
              describe: 'Verbose output',
              type: 'boolean',
              default: false
            })
            .option('debug', {
              describe: 'Enable deep module debug logging',
              type: 'boolean',
              default: false
            })
        },
        async (argv) => {
          setup_debug_logging({ verbose: argv.verbose, debug_flag: argv.debug })

          // Build ChatGPT auth object if provider is ChatGPT
          let chatgpt_auth = {}
          if (argv.provider === 'chatgpt') {
            if (
              !argv.chatgptBearerToken ||
              !argv.chatgptSessionCookies ||
              !argv.chatgptDeviceId
            ) {
              throw new Error(
                'ChatGPT provider requires --chatgpt-bearer-token, --chatgpt-session-cookies, and --chatgpt-device-id'
              )
            }

            chatgpt_auth = {
              bearer_token: argv.chatgptBearerToken,
              session_cookies: parse_json_arg(
                argv.chatgptSessionCookies,
                '--chatgpt-session-cookies'
              ),
              device_id: argv.chatgptDeviceId
            }
          }

          console.log(`Validating ${argv.provider} session files...\n`)

          const result = await validate_sessions({
            provider: argv.provider,
            claude_projects_directory: argv.claudeProjectsDir,
            cursor_db_path: argv.cursorDbPath,
            chatgpt_auth,
            pi_sessions_dir: argv.piSessionsDir,
            pi_sessions_dirs: argv.piSessionsDirs,
            verbose: argv.verbose
          })

          console.log('=== Validation Results ===')

          if (argv.provider === 'claude') {
            console.log(`Valid sessions: ${result.valid_sessions}`)
            console.log(`Invalid sessions: ${result.invalid_sessions}`)
            console.log(`Total sessions: ${result.sessions_found}`)

            const validation_rate =
              result.sessions_found > 0
                ? (
                    (result.valid_sessions / result.sessions_found) *
                    100
                  ).toFixed(1)
                : 0

            console.log(`Validation rate: ${validation_rate}%`)

            if (result.invalid_sessions > 0) {
              console.log(
                `\nValidation completed with ${result.invalid_sessions} invalid sessions`
              )
              process.exit(1)
            }
          } else if (argv.provider === 'cursor') {
            console.log(`Valid conversations: ${result.valid_conversations}`)
            console.log(
              `Invalid conversations: ${result.invalid_conversations}`
            )
            console.log(`Total conversations: ${result.conversations_found}`)

            const validation_rate =
              result.conversations_found > 0
                ? (
                    (result.valid_conversations / result.conversations_found) *
                    100
                  ).toFixed(1)
                : 0

            console.log(`Validation rate: ${validation_rate}%`)

            if (result.invalid_conversations > 0) {
              console.log(
                `\nValidation completed with ${result.invalid_conversations} invalid conversations`
              )
              process.exit(1)
            }
          } else if (argv.provider === 'chatgpt') {
            console.log(`Valid sessions: ${result.valid_sessions}`)
            console.log(`Failed fetches: ${result.failed_fetches?.length || 0}`)
            console.log(
              `Normalization errors: ${result.normalization_errors?.length || 0}`
            )
            console.log(`Total conversations: ${result.conversations_found}`)

            const validation_rate =
              result.conversations_found > 0
                ? (
                    (result.valid_sessions / result.conversations_found) *
                    100
                  ).toFixed(1)
                : 0

            console.log(`Validation rate: ${validation_rate}%`)

            const total_errors =
              (result.failed_fetches?.length || 0) +
              (result.normalization_errors?.length || 0)
            if (total_errors > 0) {
              console.log(`\nValidation completed with ${total_errors} errors`)
              process.exit(1)
            }
          } else if (argv.provider === 'pi') {
            console.log(`Sessions found: ${result.sessions_found}`)
            console.log(
              `Branches found: ${result.branches_found ?? result.valid_sessions}`
            )
            console.log(`Valid sessions: ${result.valid_sessions}`)
            console.log(`Invalid sessions: ${result.invalid_sessions}`)
            const validation_rate =
              result.sessions_found > 0
                ? (
                    (result.valid_sessions / result.sessions_found) *
                    100
                  ).toFixed(1)
                : 0
            console.log(`Validation rate: ${validation_rate}%`)
            if (result.invalid_sessions > 0) {
              console.log(
                `\nValidation completed with ${result.invalid_sessions} invalid sessions`
              )
              process.exit(1)
            }
          }

          console.log('\nAll sessions are valid!')
          process.exit(0)
        }
      )
      .option('help', {
        alias: 'h',
        describe: 'Show help'
      })
      .demandCommand(
        1,
        'You need to specify a command (list, import, or validate)'
      )
      .help()
      .example(
        '$0 list --provider claude',
        'List all available Claude sessions'
      )
      .example('$0 list --provider cursor', 'List Cursor conversations')
      .example('$0 list --provider chatgpt --chatgpt-bearer-token "..." \\', '')
      .example(
        '  --chatgpt-session-cookies "{...}" --chatgpt-device-id "..."',
        'List ChatGPT conversations'
      )
      .example(
        '$0 validate --provider cursor',
        'Check all Cursor conversations for validity'
      )
      .example(
        '$0 import --provider claude --dry-run',
        'Analyze what Claude sessions would be imported'
      )
      .example(
        '$0 import --provider cursor',
        'Import all Cursor conversations as threads'
      )
      .example(
        '$0 import --provider claude --allow-updates',
        'Update existing Claude thread imports with latest data'
      )
      .example(
        '$0 import --provider chatgpt --chatgpt-bearer-token "..." \\',
        ''
      )
      .example(
        '  --chatgpt-session-cookies "{...}" --chatgpt-device-id "..." \\',
        ''
      )
      .example('  --max-conversations 10', 'Import 10 ChatGPT conversations')
      .example('$0 import --provider claude \\', '')
      .example(
        '  --session-id "5ede99f2-c215-4e31-aa24-9cdfd5070feb"',
        'Import specific Claude session'
      )
      .example('$0 import --provider cursor --from-date "2025-06-15" \\', '')
      .example('  --max-entries 50', 'Import recent small Cursor conversations')
      .argv
  } catch (error) {
    console.error('\nExternal session conversion failed:', error.message)

    // Provide helpful hints for common errors
    if (
      error.message.includes('ENOENT') ||
      error.message.includes('no such file')
    ) {
      console.error(
        'Hint: Check that the specified directory or file path exists'
      )
    } else if (
      error.message.includes('EACCES') ||
      error.message.includes('permission denied')
    ) {
      console.error('Hint: Check file/directory permissions')
    } else if (
      error.message.includes('authentication') ||
      error.message.includes('unauthorized')
    ) {
      console.error(
        'Hint: Verify authentication credentials (tokens, cookies, etc.)'
      )
    } else {
      console.error(
        'Hint: Run with --verbose flag for more detailed error information'
      )
    }

    // Show stack trace in debug mode
    if (process.env.DEBUG) {
      console.error('\nStack trace:')
      console.error(error.stack)
    }

    process.exit(1)
  }
}

if (isMain(import.meta.url)) {
  main()
}
