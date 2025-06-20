#!/usr/bin/env node

/**
 * Convert External Sessions Script
 *
 * Command-line script to convert external AI chat sessions from multiple providers
 * (Claude Code, Cursor) into Base execution threads with complete timeline preservation.
 */

import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import config from '#config'
import { isMain } from '#libs-server'

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
  get_unsupported_features as get_cursor_unsupported,
  clear_unsupported_tracking as clear_cursor_unsupported
} from '#libs-server/integrations/cursor/normalize-session.mjs'

// OpenAI integration
import {
  import_openai_conversations_to_threads,
  list_openai_conversations
} from '#libs-server/integrations/openai/index.mjs'
import {
  get_unsupported_features as get_openai_unsupported,
  clear_unsupported_tracking as clear_openai_unsupported
} from '#libs-server/integrations/openai/normalize-session.mjs'

const log = debug('convert-external-sessions')

// Enable debug logging
debug.enable('convert-external-sessions,integrations:claude*,integrations:cursor*,integrations:openai*')

/**
 * List available sessions from a provider
 */
export async function list_sessions({
  provider = 'claude',
  claude_projects_dir = '~/.claude/projects',
  cursor_db_path = '~/Library/Application Support/Cursor/User/globalStorage/state.vscdb',
  openai_auth = {},
  include_summaries = false,
  verbose = false
} = {}) {
  try {
    log(`Listing ${provider} sessions...`)

    if (provider === 'claude') {
      return await list_claude_sessions({
        projects_dir: claude_projects_dir,
        include_summaries
      })
    } else if (provider === 'cursor') {
      return await list_cursor_conversations({
        cursor_data_path: cursor_db_path,
        include_summaries
      })
    } else if (provider === 'openai') {
      return await list_openai_conversations({
        ...openai_auth,
        max_conversations: 50, // Default to reasonable limit for listing
        include_summaries
      })
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
export async function import_sessions({
  provider = 'claude',
  claude_projects_dir = '~/.claude/projects',
  cursor_db_path = '~/Library/Application Support/Cursor/User/globalStorage/state.vscdb',
  openai_auth = {},
  user_base_directory = config.user_base_directory || '/Users/trashman/user-base',
  session_id,
  from_date,
  to_date,
  max_entries,
  max_conversations,
  dry_run = false,
  verbose = false
} = {}) {
  try {
    log(dry_run ? `Running dry run analysis for ${provider}...` : `Starting ${provider} session import...`)

    let filter_sessions = null

    if (provider === 'claude') {
      // Build filter function for Claude
      if (session_id || from_date || to_date || max_entries) {
        filter_sessions = (session) => {
          if (session_id && session.session_id !== session_id) {
            return false
          }

          if (from_date || to_date) {
            const session_start = session.metadata?.start_time
            if (session_start) {
              const start_date = new Date(session_start)
              if (from_date && start_date < new Date(from_date)) {
                return false
              }
              if (to_date && start_date > new Date(to_date + 'T23:59:59')) {
                return false
              }
            }
          }

          if (max_entries && session.entries?.length > max_entries) {
            return false
          }

          return true
        }
      }

      return await import_claude_sessions_to_threads({
        projects_dir: claude_projects_dir,
        user_base_directory,
        filter_sessions,
        dry_run,
        verbose
      })
    } else if (provider === 'cursor') {
      // Build filter function for Cursor
      if (session_id || from_date || to_date || max_entries) {
        filter_sessions = (conversation) => {
          if (session_id && conversation.composer_id !== session_id) {
            return false
          }

          if (from_date || to_date) {
            const conv_start = conversation.created_at
            if (conv_start) {
              const start_date = new Date(conv_start)
              if (from_date && start_date < new Date(from_date)) {
                return false
              }
              if (to_date && start_date > new Date(to_date + 'T23:59:59')) {
                return false
              }
            }
          }

          if (max_entries && conversation.messages?.length > max_entries) {
            return false
          }

          return true
        }
      }

      return await import_cursor_conversations_to_threads({
        cursor_data_path: cursor_db_path,
        user_base_directory,
        filter_conversations: filter_sessions,
        dry_run,
        verbose
      })
    } else if (provider === 'openai') {
      // Build filter function for OpenAI
      if (session_id || from_date || to_date || max_entries) {
        filter_sessions = (conversation) => {
          if (session_id && conversation.id !== session_id) {
            return false
          }

          if (from_date || to_date) {
            const conv_start = conversation.create_time
            if (conv_start) {
              const start_date = new Date(conv_start * 1000) // OpenAI uses Unix timestamp
              if (from_date && start_date < new Date(from_date)) {
                return false
              }
              if (to_date && start_date > new Date(to_date + 'T23:59:59')) {
                return false
              }
            }
          }

          return true
        }
      }

      return await import_openai_conversations_to_threads({
        ...openai_auth,
        max_conversations: max_conversations || 100, // Default limit for safety
        filter_conversations: filter_sessions,
        user_base_directory,
        dry_run,
        verbose
      })
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
export async function validate_sessions({
  provider = 'claude',
  claude_projects_dir = '~/.claude/projects',
  cursor_db_path = '~/Library/Application Support/Cursor/User/globalStorage/state.vscdb',
  openai_auth = {},
  verbose = false
} = {}) {
  try {
    log(`Validating ${provider} session files...`)

    return await import_sessions({
      provider,
      claude_projects_dir,
      cursor_db_path,
      openai_auth,
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
              choices: ['claude', 'cursor', 'openai'],
              default: 'claude'
            })
            .option('claude-projects-dir', {
              describe: 'Claude projects directory',
              type: 'string',
              default: '~/.claude/projects'
            })
            .option('cursor-db-path', {
              describe: 'Cursor database path',
              type: 'string',
              default: '~/Library/Application Support/Cursor/User/globalStorage/state.vscdb'
            })
            .option('openai-bearer-token', {
              describe: 'OpenAI JWT Bearer token for authentication',
              type: 'string'
            })
            .option('openai-session-cookies', {
              describe: 'OpenAI session cookies (JSON string)',
              type: 'string'
            })
            .option('openai-device-id', {
              describe: 'OpenAI device ID',
              type: 'string'
            })
            .option('summaries', {
              alias: 's',
              describe: 'Include session summaries',
              type: 'boolean',
              default: false
            })
            .option('verbose', {
              alias: 'v',
              describe: 'Verbose output',
              type: 'boolean',
              default: false
            })
        },
        async (argv) => {
          if (argv.verbose) {
            debug.enabled = () => true
          }

          // Clear unsupported tracking for fresh analysis
          clear_claude_unsupported()
          clear_cursor_unsupported()
          clear_openai_unsupported()

          // Build OpenAI auth object if provider is OpenAI
          let openai_auth = {}
          if (argv.provider === 'openai') {
            if (!argv.openaiBearerToken || !argv.openaiSessionCookies || !argv.openaiDeviceId) {
              throw new Error('OpenAI provider requires --openai-bearer-token, --openai-session-cookies, and --openai-device-id')
            }

            openai_auth = {
              bearer_token: argv.openaiBearerToken,
              session_cookies: JSON.parse(argv.openaiSessionCookies),
              device_id: argv.openaiDeviceId
            }
          }

          const sessions = await list_sessions({
            provider: argv.provider,
            claude_projects_dir: argv.claudeProjectsDir,
            cursor_db_path: argv.cursorDbPath,
            openai_auth,
            include_summaries: argv.summaries,
            verbose: argv.verbose
          })

          console.log(`\nFound ${sessions.length} ${argv.provider} sessions:\n`)

          sessions.forEach((session, index) => {
            console.log(`${index + 1}. Session: ${session.session_id || session.composer_id}`)

            if (argv.provider === 'claude') {
              console.log(`   File: ${session.file_source}`)
              console.log(`   Entries: ${session.entry_count}`)
              console.log(`   Duration: ${session.duration_minutes?.toFixed(1) || 'unknown'} minutes`)
              console.log(`   Working Dir: ${session.working_directory}`)
              console.log(`   Time: ${session.start_time?.toLocaleString() || 'unknown'} - ${session.end_time?.toLocaleString() || 'unknown'}`)

              if (argv.summaries && session.summaries?.length > 0) {
                console.log('   Summaries:')
                session.summaries.slice(0, 3).forEach(summary => {
                  console.log(`     • ${summary}`)
                })
                if (session.summaries.length > 3) {
                  console.log(`     ... and ${session.summaries.length - 3} more`)
                }
              }
            } else if (argv.provider === 'cursor') {
              console.log(`   Messages: ${session.message_count}`)
              console.log(`   Duration: ${session.duration_minutes?.toFixed(1) || 'unknown'} minutes`)
              console.log(`   Created: ${session.created_at ? new Date(session.created_at).toLocaleString() : 'unknown'}`)
              console.log(`   Updated: ${session.last_updated_at ? new Date(session.last_updated_at).toLocaleString() : 'unknown'}`)

              if (argv.summaries) {
                if (session.summary) {
                  console.log(`   Summary: ${session.summary}`)
                }
                console.log(`   Code blocks: ${session.has_code_blocks ? 'Yes' : 'No'}`)
                console.log(`   Model: ${session.model_used}`)
              }
            } else if (argv.provider === 'openai') {
              console.log(`   Title: ${session.title}`)
              console.log(`   Created: ${session.created_at ? new Date(session.created_at).toLocaleString() : 'unknown'}`)
              console.log(`   Updated: ${session.updated_at ? new Date(session.updated_at).toLocaleString() : 'unknown'}`)
              console.log(`   Archived: ${session.is_archived ? 'Yes' : 'No'}`)

              if (argv.summaries) {
                console.log(`   Starred: ${session.is_starred ? 'Yes' : 'No'}`)
                console.log(`   Memory: ${session.memory_scope || 'none'}`)
                if (session.gizmo_id) {
                  console.log(`   GPT: ${session.gizmo_id}`)
                }
              }
            }

            console.log('')
          })
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
              choices: ['claude', 'cursor', 'openai'],
              default: 'claude'
            })
            .option('claude-projects-dir', {
              describe: 'Claude projects directory',
              type: 'string',
              default: '~/.claude/projects'
            })
            .option('cursor-db-path', {
              describe: 'Cursor database path',
              type: 'string',
              default: '~/Library/Application Support/Cursor/User/globalStorage/state.vscdb'
            })
            .option('openai-bearer-token', {
              describe: 'OpenAI JWT Bearer token for authentication',
              type: 'string'
            })
            .option('openai-session-cookies', {
              describe: 'OpenAI session cookies (JSON string)',
              type: 'string'
            })
            .option('openai-device-id', {
              describe: 'OpenAI device ID',
              type: 'string'
            })
            .option('user-base-dir', {
              alias: 'u',
              describe: 'User base directory',
              type: 'string',
              default: config.user_base_directory || '/Users/trashman/user-base'
            })
            .option('session-id', {
              describe: 'Import specific session ID only',
              type: 'string'
            })
            .option('from-date', {
              describe: 'Import sessions from date (YYYY-MM-DD)',
              type: 'string'
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
              describe: 'Maximum number of conversations to import (for OpenAI)',
              type: 'number'
            })
            .option('dry-run', {
              describe: 'Show what would be imported without creating threads',
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
              // Validate date format if provided
              if (argv.fromDate) {
                const date = new Date(argv.fromDate)
                if (isNaN(date.getTime())) {
                  throw new Error('Invalid date format for --from-date. Use YYYY-MM-DD format')
                }
              }
              if (argv.toDate) {
                const date = new Date(argv.toDate)
                if (isNaN(date.getTime())) {
                  throw new Error('Invalid date format for --to-date. Use YYYY-MM-DD format')
                }
              }
              return true
            })
        },
        async (argv) => {
          if (argv.verbose) {
            debug.enabled = () => true
          }

          // Clear unsupported tracking for fresh analysis
          clear_claude_unsupported()
          clear_cursor_unsupported()
          clear_openai_unsupported()

          // Build OpenAI auth object if provider is OpenAI
          let openai_auth = {}
          if (argv.provider === 'openai') {
            if (!argv.openaiBearerToken || !argv.openaiSessionCookies || !argv.openaiDeviceId) {
              throw new Error('OpenAI provider requires --openai-bearer-token, --openai-session-cookies, and --openai-device-id')
            }

            openai_auth = {
              bearer_token: argv.openaiBearerToken,
              session_cookies: JSON.parse(argv.openaiSessionCookies),
              device_id: argv.openaiDeviceId
            }
          }

          if (argv.dryRun) {
            console.log(`🔍 Dry run mode - analyzing ${argv.provider} sessions...\n`)
          } else {
            console.log(`🚀 Starting ${argv.provider} session import...\n`)
          }

          const result = await import_sessions({
            provider: argv.provider,
            claude_projects_dir: argv.claudeProjectsDir,
            cursor_db_path: argv.cursorDbPath,
            openai_auth,
            user_base_directory: argv.userBaseDir,
            session_id: argv.sessionId,
            from_date: argv.fromDate,
            to_date: argv.toDate,
            max_entries: argv.maxEntries,
            max_conversations: argv.maxConversations,
            dry_run: argv.dryRun,
            verbose: argv.verbose
          })

          console.log('\n=== Import Results ===')

          if (argv.provider === 'claude') {
            console.log(`Sessions found: ${result.sessions_found}`)
            console.log(`Valid sessions: ${result.valid_sessions}`)
            console.log(`Invalid sessions: ${result.invalid_sessions}`)
          } else if (argv.provider === 'cursor') {
            console.log(`Conversations found: ${result.conversations_found}`)
            console.log(`Valid conversations: ${result.valid_conversations}`)
            console.log(`Invalid conversations: ${result.invalid_conversations}`)
          } else if (argv.provider === 'openai') {
            console.log(`Conversations found: ${result.conversations_found}`)
            console.log(`Conversations fetched: ${result.conversations_fetched}`)
            console.log(`Valid sessions: ${result.valid_sessions}`)
          }

          if (argv.dryRun) {
            console.log(`Would create threads: ${result.would_create}`)
          } else {
            console.log(`Threads created: ${result.threads_created}`)
            console.log(`Threads failed: ${result.threads_failed}`)
            console.log(`Success rate: ${result.success_rate}%`)

            if (result.results?.created?.length > 0) {
              console.log('\n📁 Created threads:')
              result.results.created.slice(0, 5).forEach(thread => {
                console.log(`  ${thread.thread_id} (${thread.timeline_entries || 'unknown'} entries)`)
              })
              if (result.results.created.length > 5) {
                console.log(`  ... and ${result.results.created.length - 5} more`)
              }
            }

            if (result.results?.failed?.length > 0) {
              console.log('\n❌ Failed threads:')
              result.results.failed.forEach(failure => {
                const id = failure.session_id || failure.composer_id
                console.log(`  ${id}: ${failure.error}`)
              })
            }
          }

          // Display unsupported features summary
          let unsupported
          if (argv.provider === 'claude') {
            unsupported = get_claude_unsupported()
          } else if (argv.provider === 'cursor') {
            unsupported = get_cursor_unsupported()
          } else if (argv.provider === 'openai') {
            unsupported = get_openai_unsupported()
          }

          if (argv.provider === 'claude' && Object.values(unsupported).some(arr => arr.length > 0)) {
            console.log('\n🔶 === Unsupported Features Found ===')
            console.log('The following Claude features were encountered but not fully supported:')

            if (unsupported.entry_types.length > 0) {
              console.log(`\n📋 Entry Types (${unsupported.entry_types.length}):`)
              unsupported.entry_types.forEach(type => console.log(`  • ${type}`))
            }

            console.log('\n💡 These features have been preserved in the converted data.')
          } else if (argv.provider === 'cursor' && Object.values(unsupported).some(arr => arr.length > 0)) {
            console.log('\n🔶 === Unsupported Features Found ===')
            console.log('The following Cursor features were encountered but not fully supported:')
            Object.entries(unsupported).forEach(([key, values]) => {
              if (values.length > 0) {
                console.log(`\n📋 ${key} (${values.length}):`)
                values.forEach(value => console.log(`  • ${value}`))
              }
            })
          } else if (argv.provider === 'openai' && Object.values(unsupported).some(arr => arr.length > 0)) {
            console.log('\n🔶 === Unsupported Features Found ===')
            console.log('The following OpenAI features were encountered but not fully supported:')
            Object.entries(unsupported).forEach(([key, values]) => {
              if (values.length > 0) {
                console.log(`\n📋 ${key} (${values.length}):`)
                values.forEach(value => console.log(`  • ${value}`))
              }
            })
            console.log('\n💡 These features have been preserved in the converted data.')
          }

          // Exit with appropriate code
          if (result.results?.failed?.length > 0) {
            console.log(`\n⚠️  Completed with ${result.results.failed.length} errors`)
            process.exit(1)
          } else {
            console.log('\n✅ Import completed successfully!')
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
              choices: ['claude', 'cursor', 'openai'],
              default: 'claude'
            })
            .option('claude-projects-dir', {
              describe: 'Claude projects directory',
              type: 'string',
              default: '~/.claude/projects'
            })
            .option('cursor-db-path', {
              describe: 'Cursor database path',
              type: 'string',
              default: '~/Library/Application Support/Cursor/User/globalStorage/state.vscdb'
            })
            .option('openai-bearer-token', {
              describe: 'OpenAI JWT Bearer token for authentication',
              type: 'string'
            })
            .option('openai-session-cookies', {
              describe: 'OpenAI session cookies (JSON string)',
              type: 'string'
            })
            .option('openai-device-id', {
              describe: 'OpenAI device ID',
              type: 'string'
            })
            .option('verbose', {
              alias: 'v',
              describe: 'Verbose output',
              type: 'boolean',
              default: false
            })
        },
        async (argv) => {
          if (argv.verbose) {
            debug.enabled = () => true
          }

          // Build OpenAI auth object if provider is OpenAI
          let openai_auth = {}
          if (argv.provider === 'openai') {
            if (!argv.openaiBearerToken || !argv.openaiSessionCookies || !argv.openaiDeviceId) {
              throw new Error('OpenAI provider requires --openai-bearer-token, --openai-session-cookies, and --openai-device-id')
            }

            openai_auth = {
              bearer_token: argv.openaiBearerToken,
              session_cookies: JSON.parse(argv.openaiSessionCookies),
              device_id: argv.openaiDeviceId
            }
          }

          console.log(`🔍 Validating ${argv.provider} session files...\n`)

          const result = await validate_sessions({
            provider: argv.provider,
            claude_projects_dir: argv.claudeProjectsDir,
            cursor_db_path: argv.cursorDbPath,
            openai_auth,
            verbose: argv.verbose
          })

          console.log('=== Validation Results ===')

          if (argv.provider === 'claude') {
            console.log(`✅ Valid sessions: ${result.valid_sessions}`)
            console.log(`❌ Invalid sessions: ${result.invalid_sessions}`)
            console.log(`📊 Total sessions: ${result.sessions_found}`)

            const validation_rate = result.sessions_found > 0
              ? ((result.valid_sessions / result.sessions_found) * 100).toFixed(1)
              : 0

            console.log(`📈 Validation rate: ${validation_rate}%`)

            if (result.invalid_sessions > 0) {
              console.log(`\n⚠️  Validation completed with ${result.invalid_sessions} invalid sessions`)
              process.exit(1)
            }
          } else if (argv.provider === 'cursor') {
            console.log(`✅ Valid conversations: ${result.valid_conversations}`)
            console.log(`❌ Invalid conversations: ${result.invalid_conversations}`)
            console.log(`📊 Total conversations: ${result.conversations_found}`)

            const validation_rate = result.conversations_found > 0
              ? ((result.valid_conversations / result.conversations_found) * 100).toFixed(1)
              : 0

            console.log(`📈 Validation rate: ${validation_rate}%`)

            if (result.invalid_conversations > 0) {
              console.log(`\n⚠️  Validation completed with ${result.invalid_conversations} invalid conversations`)
              process.exit(1)
            }
          } else if (argv.provider === 'openai') {
            console.log(`✅ Valid sessions: ${result.valid_sessions}`)
            console.log(`❌ Failed fetches: ${result.failed_fetches?.length || 0}`)
            console.log(`❌ Normalization errors: ${result.normalization_errors?.length || 0}`)
            console.log(`📊 Total conversations: ${result.conversations_found}`)

            const validation_rate = result.conversations_found > 0
              ? ((result.valid_sessions / result.conversations_found) * 100).toFixed(1)
              : 0

            console.log(`📈 Validation rate: ${validation_rate}%`)

            const total_errors = (result.failed_fetches?.length || 0) + (result.normalization_errors?.length || 0)
            if (total_errors > 0) {
              console.log(`\n⚠️  Validation completed with ${total_errors} errors`)
              process.exit(1)
            }
          }

          console.log('\n✅ All sessions are valid!')
          process.exit(0)
        }
      )
      .option('help', {
        alias: 'h',
        describe: 'Show help'
      })
      .demandCommand(1, 'You need to specify a command (list, import, or validate)')
      .help()
      .example('$0 list --provider claude', 'List all available Claude sessions')
      .example('$0 list --provider cursor --summaries', 'List Cursor conversations with summaries')
      .example('$0 list --provider openai --openai-bearer-token "..." \\', '')
      .example('  --openai-session-cookies "{...}" --openai-device-id "..."', 'List OpenAI conversations')
      .example('$0 validate --provider cursor', 'Check all Cursor conversations for validity')
      .example('$0 import --provider claude --dry-run', 'Analyze what Claude sessions would be imported')
      .example('$0 import --provider cursor', 'Import all Cursor conversations as threads')
      .example('$0 import --provider openai --openai-bearer-token "..." \\', '')
      .example('  --openai-session-cookies "{...}" --openai-device-id "..." \\', '')
      .example('  --max-conversations 10', 'Import 10 OpenAI conversations')
      .example('$0 import --provider claude \\', '')
      .example('  --session-id "5ede99f2-c215-4e31-aa24-9cdfd5070feb"', 'Import specific Claude session')
      .example('$0 import --provider cursor --from-date "2025-06-15" \\', '')
      .example('  --max-entries 50', 'Import recent small Cursor conversations').argv
  } catch (error) {
    console.error('\n❌ External session conversion failed:', error.message)

    // Show stack trace in debug mode
    if (process.env.DEBUG) {
      console.error(error.stack)
    }

    process.exit(1)
  }
}

if (isMain(import.meta.url)) {
  debug.enable('convert-external-sessions,integrations:claude*,integrations:cursor*,integrations:openai*,integrations:thread*')
  main()
}
