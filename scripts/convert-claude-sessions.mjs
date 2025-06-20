#!/usr/bin/env node

/**
 * Convert Claude Sessions Script
 *
 * Command-line script to convert Claude Code sessions from ~/.claude/projects/
 * into Base execution threads with complete timeline preservation.
 */

import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import config from '#config'
import { isMain } from '#libs-server'
import { import_claude_sessions_to_threads, list_claude_sessions } from '#libs-server/integrations/claude/index.mjs'
import { get_unsupported_summary, clear_unsupported_tracking } from '#libs-server/integrations/claude/normalize-session.mjs'

const log = debug('convert-claude-sessions')

// Enable debug logging for Claude integration
debug.enable('convert-claude-sessions,integrations:claude*')

/**
 * List available Claude sessions
 * @param {Object} options - List options
 * @returns {Array} Array of session metadata
 */
export async function list_sessions({
  projects_dir = '~/.claude/projects',
  include_summaries = false,
  verbose = false
} = {}) {
  try {
    log('Listing Claude sessions...')

    const sessions = await list_claude_sessions({
      projects_dir,
      include_summaries
    })

    return sessions
  } catch (error) {
    log(`Error listing Claude sessions: ${error.message}`)
    throw error
  }
}

/**
 * Import Claude sessions to Base threads
 * @param {Object} options - Import options
 * @returns {Object} Import results summary
 */
export async function import_sessions({
  projects_dir = '~/.claude/projects',
  user_base_directory = config.user_base_directory || '/Users/trashman/user-base',
  session_id,
  from_date,
  to_date,
  max_entries,
  dry_run = false,
  verbose = false
} = {}) {
  try {
    // Build filter function
    let filter_sessions = null
    if (session_id || from_date || to_date || max_entries) {
      filter_sessions = (session) => {
        // Filter by specific session ID
        if (session_id && session.session_id !== session_id) {
          return false
        }

        // Filter by date range
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

        // Filter by entry count
        if (max_entries && session.entries?.length > max_entries) {
          return false
        }

        return true
      }
    }

    log(dry_run ? 'Running dry run analysis...' : 'Starting Claude session import...')

    const result = await import_claude_sessions_to_threads({
      projects_dir,
      user_base_directory,
      filter_sessions,
      dry_run,
      verbose
    })

    return result
  } catch (error) {
    log(`Error importing Claude sessions: ${error.message}`)
    throw error
  }
}

/**
 * Validate Claude session files
 * @param {Object} options - Validation options
 * @returns {Object} Validation results
 */
export async function validate_sessions({
  projects_dir = '~/.claude/projects',
  verbose = false
} = {}) {
  try {
    log('Validating Claude session files...')

    const result = await import_claude_sessions_to_threads({
      projects_dir,
      dry_run: true,
      verbose: true
    })

    return result
  } catch (error) {
    log(`Error validating Claude sessions: ${error.message}`)
    throw error
  }
}

// Command-line interface
const main = async () => {
  try {
    await yargs(hideBin(process.argv))
      .command(
        'list',
        'List available Claude sessions',
        (yargs) => {
          return yargs
            .option('projects-dir', {
              alias: 'd',
              describe: 'Claude projects directory',
              type: 'string',
              default: '~/.claude/projects'
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
          clear_unsupported_tracking()

          const sessions = await list_sessions({
            projects_dir: argv.projectsDir,
            include_summaries: argv.summaries,
            verbose: argv.verbose
          })

          console.log(`\nFound ${sessions.length} Claude sessions:\n`)

          sessions.forEach((session, index) => {
            console.log(`${index + 1}. Session: ${session.session_id}`)
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
            console.log('')
          })
        }
      )
      .command(
        'import',
        'Import Claude sessions as Base threads',
        (yargs) => {
          return yargs
            .option('projects-dir', {
              alias: 'd',
              describe: 'Claude projects directory',
              type: 'string',
              default: '~/.claude/projects'
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
              describe: 'Skip sessions with more than N entries',
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
          clear_unsupported_tracking()

          if (argv.dryRun) {
            console.log('🔍 Dry run mode - analyzing Claude sessions...\n')
          } else {
            console.log('🚀 Starting Claude session import...\n')
          }

          const result = await import_sessions({
            projects_dir: argv.projectsDir,
            user_base_directory: argv.userBaseDir,
            session_id: argv.sessionId,
            from_date: argv.fromDate,
            to_date: argv.toDate,
            max_entries: argv.maxEntries,
            dry_run: argv.dryRun,
            verbose: argv.verbose
          })

          console.log('\n=== Import Results ===')
          console.log(`Sessions found: ${result.sessions_found}`)
          console.log(`Valid sessions: ${result.valid_sessions}`)
          console.log(`Invalid sessions: ${result.invalid_sessions}`)

          if (argv.dryRun) {
            console.log(`Would create threads: ${result.would_create}`)
          } else {
            console.log(`Threads created: ${result.threads_created}`)
            console.log(`Threads failed: ${result.threads_failed}`)
            console.log(`Success rate: ${result.success_rate}%`)

            if (result.results?.created?.length > 0) {
              console.log('\n📁 Created threads:')
              result.results.created.slice(0, 5).forEach(thread => {
                console.log(`  ${thread.thread_id} (${thread.timeline_entries} entries)`)
              })
              if (result.results.created.length > 5) {
                console.log(`  ... and ${result.results.created.length - 5} more`)
              }
            }

            if (result.results?.failed?.length > 0) {
              console.log('\n❌ Failed threads:')
              result.results.failed.forEach(failure => {
                console.log(`  ${failure.session_id}: ${failure.error}`)
              })
            }
          }

          // Display unsupported features summary
          const unsupported = get_unsupported_summary()
          const has_unsupported = Object.values(unsupported).some(arr => arr.length > 0)

          if (has_unsupported) {
            console.log('\n🔶 === Unsupported Features Found ===')
            console.log('The following features were encountered but not fully supported:')

            if (unsupported.entry_types.length > 0) {
              console.log(`\n📋 Entry Types (${unsupported.entry_types.length}):`)
              unsupported.entry_types.forEach(type => console.log(`  • ${type}`))
            }

            if (unsupported.content_types.length > 0) {
              console.log(`\n📝 Content Types (${unsupported.content_types.length}):`)
              unsupported.content_types.forEach(type => console.log(`  • ${type}`))
            }

            if (unsupported.message_fields.length > 0) {
              console.log(`\n🏷️  Message Fields (${unsupported.message_fields.length}):`)
              unsupported.message_fields.forEach(field => console.log(`  • ${field}`))
            }

            if (unsupported.metadata_fields.length > 0) {
              console.log(`\n📊 Metadata Fields (${unsupported.metadata_fields.length}):`)
              unsupported.metadata_fields.forEach(field => console.log(`  • ${field}`))
            }

            console.log('\n💡 These features have been preserved in the converted data but may need')
            console.log('   specific handling for full functionality. Consider adding support for them.')
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
        'Validate Claude session files without importing',
        (yargs) => {
          return yargs
            .option('projects-dir', {
              alias: 'd',
              describe: 'Claude projects directory',
              type: 'string',
              default: '~/.claude/projects'
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

          console.log('🔍 Validating Claude session files...\n')

          const result = await validate_sessions({
            projects_dir: argv.projectsDir,
            verbose: argv.verbose
          })

          console.log('=== Validation Results ===')
          console.log(`✅ Valid sessions: ${result.valid_sessions}`)
          console.log(`❌ Invalid sessions: ${result.invalid_sessions}`)
          console.log(`📊 Total sessions: ${result.sessions_found}`)

          const validation_rate = result.sessions_found > 0
            ? ((result.valid_sessions / result.sessions_found) * 100).toFixed(1)
            : 0

          console.log(`📈 Validation rate: ${validation_rate}%`)

          // Exit with appropriate code
          if (result.invalid_sessions > 0) {
            console.log(`\n⚠️  Validation completed with ${result.invalid_sessions} invalid sessions`)
            process.exit(1)
          } else {
            console.log('\n✅ All sessions are valid!')
            process.exit(0)
          }
        }
      )
      .option('help', {
        alias: 'h',
        describe: 'Show help'
      })
      .demandCommand(1, 'You need to specify a command (list, import, or validate)')
      .help()
      .example('$0 list', 'List all available Claude sessions')
      .example('$0 list --summaries --verbose', 'List sessions with detailed summaries')
      .example('$0 validate', 'Check all session files for validity')
      .example('$0 import --dry-run', 'Analyze what would be imported without creating threads')
      .example('$0 import', 'Import all Claude sessions as threads')
      .example('$0 import --session-id "5ede99f2-c215-4e31-aa24-9cdfd5070feb"', 'Import specific session')
      .example('$0 import --from-date "2025-06-15" --to-date "2025-06-20"', 'Import sessions from date range')
      .example('$0 import --max-entries 50', 'Import only sessions with 50 or fewer entries').argv
  } catch (error) {
    console.error('\n❌ Claude session conversion failed:', error.message)

    // Show stack trace in debug mode
    if (process.env.DEBUG) {
      console.error(error.stack)
    }

    process.exit(1)
  }
}

if (isMain(import.meta.url)) {
  debug.enable('convert-claude-sessions,integrations:claude*,integrations:thread*')
  main()
}
