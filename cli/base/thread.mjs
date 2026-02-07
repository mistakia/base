/**
 * Thread subcommand group
 *
 * Wraps thread query, archive, and analysis operations.
 */

import { update_thread_state } from '#libs-server/threads/update-thread.mjs'
import { analyze_thread_relations } from '#libs-server/metadata/analyze-thread-relations.mjs'
import { thread_constants } from '#libs-shared'
import {
  SERVER_URL,
  is_api_unavailable,
  flush_and_exit
} from './lib/format.mjs'
import { authenticated_fetch } from './lib/auth.mjs'

const { THREAD_STATE, ARCHIVE_REASON } = thread_constants

export const command = 'thread <command>'
export const describe = 'Thread operations (list, archive, analyze)'

export const builder = (yargs) =>
  yargs
    .command(
      'list',
      'Query threads',
      (yargs) =>
        yargs
          .option('state', {
            describe: 'Filter by thread state (active, archived)',
            type: 'string'
          })
          .option('search', {
            alias: 's',
            describe: 'Search title and short_description',
            type: 'string'
          })
          .option('file-ref', {
            describe: 'Filter by file reference pattern (e.g., user:config/*)',
            type: 'string'
          })
          .option('dir-ref', {
            describe: 'Filter by directory reference pattern',
            type: 'string'
          })
          .option('tags', {
            describe:
              'Filter by tag base_uri(s), comma-separated (e.g., user:tag/project.md)',
            type: 'string'
          })
          .option('relates-to', {
            describe: 'Find threads relating to a target entity (base_uri)',
            type: 'string'
          })
          .option('relation-type', {
            describe:
              'Filter by relation type (modifies, accesses, creates, relates_to)',
            type: 'string'
          })
          .option('limit', {
            alias: 'l',
            describe: 'Max results',
            type: 'number',
            default: 50
          })
          .option('offset', {
            describe: 'Offset for pagination',
            type: 'number',
            default: 0
          }),
      handle_list
    )
    .command(
      'archive <thread_id>',
      'Archive or reactivate a thread',
      (yargs) =>
        yargs
          .positional('thread_id', {
            describe: 'Thread ID',
            type: 'string'
          })
          .option('completed', {
            describe: 'Archive as completed',
            type: 'boolean',
            default: false
          })
          .option('user-abandoned', {
            describe: 'Archive as user abandoned',
            type: 'boolean',
            default: false
          })
          .option('reactivate', {
            describe: 'Reactivate an archived thread',
            type: 'boolean',
            default: false
          })
          .check((argv) => {
            const options = [
              argv.completed,
              argv['user-abandoned'],
              argv.reactivate
            ].filter(Boolean)
            if (options.length !== 1) {
              throw new Error(
                'Specify exactly one of: --completed, --user-abandoned, or --reactivate'
              )
            }
            return true
          }),
      handle_archive
    )
    .command(
      'analyze <thread_id>',
      'Analyze thread relations',
      (yargs) =>
        yargs
          .positional('thread_id', {
            describe: 'Thread ID',
            type: 'string'
          })
          .option('dry-run', {
            alias: 'n',
            describe: 'Preview changes',
            type: 'boolean',
            default: false
          })
          .option('force', {
            alias: 'f',
            describe: 'Re-analyze even if already done',
            type: 'boolean',
            default: false
          }),
      handle_analyze
    )
    .demandCommand(1, 'Specify a subcommand: list, archive, or analyze')

export const handler = () => {}

async function handle_list(argv) {
  let exit_code = 0
  try {
    const params = new URLSearchParams()
    if (argv.state) params.set('thread_state', argv.state)
    if (argv.search) params.set('search', argv.search)
    if (argv['file-ref']) params.set('file_ref', argv['file-ref'])
    if (argv['dir-ref']) params.set('dir_ref', argv['dir-ref'])
    if (argv.tags) params.set('tags', argv.tags)
    if (argv['relates-to']) params.set('relates_to', argv['relates-to'])
    if (argv['relation-type'])
      params.set('relation_type', argv['relation-type'])
    params.set('limit', String(argv.limit))
    params.set('offset', String(argv.offset))
    params.set('include_timeline', 'false')

    const is_relation_query = Boolean(argv['relates-to'])

    let threads
    try {
      const response = await authenticated_fetch(
        `${SERVER_URL}/api/threads?${params}`
      )
      if (!response.ok) {
        throw new Error(`API returned ${response.status}`)
      }
      threads = await response.json()
    } catch (error) {
      if (is_api_unavailable(error)) {
        throw new Error(
          'Thread listing requires a running server. Start the server and try again.'
        )
      }
      throw error
    }

    if (!threads || threads.length === 0) {
      if (argv.json) {
        console.log('[]')
      } else {
        console.log('No threads found')
      }
    } else if (argv.json) {
      console.log(JSON.stringify(threads, null, 2))
    } else {
      for (const thread of threads) {
        const parts = [thread.thread_id, thread.thread_state || '']
        // Include relation type when filtering by relation
        if (is_relation_query && thread.relation_type) {
          parts.push(thread.relation_type)
        }
        parts.push(thread.title || '')
        console.log(parts.join('\t'))
      }
    }
  } catch (error) {
    console.error(`Error: ${error.message}`)
    exit_code = 1
  }
  flush_and_exit(exit_code)
}

async function handle_archive(argv) {
  let exit_code = 0
  try {
    let thread_state, reason

    if (argv.reactivate) {
      thread_state = THREAD_STATE.ACTIVE
    } else {
      thread_state = THREAD_STATE.ARCHIVED
      if (argv.completed) {
        reason = ARCHIVE_REASON.COMPLETED
      } else if (argv['user-abandoned']) {
        reason = ARCHIVE_REASON.USER_ABANDONED
      }
    }

    const updated_thread = await update_thread_state({
      thread_id: argv.thread_id,
      thread_state,
      reason: reason || undefined
    })

    if (argv.json) {
      console.log(JSON.stringify(updated_thread, null, 2))
    } else {
      const action = argv.reactivate ? 'reactivated' : 'archived'
      console.log(
        `${updated_thread.thread_id}\t${updated_thread.thread_state}\t${action}`
      )
    }
  } catch (error) {
    console.error(`Error: ${error.message}`)
    exit_code = 1
  }
  flush_and_exit(exit_code)
}

async function handle_analyze(argv) {
  let exit_code = 0
  try {
    const result = await analyze_thread_relations({
      thread_id: argv.thread_id,
      dry_run: argv['dry-run'],
      force: argv.force
    })

    if (argv.json) {
      console.log(JSON.stringify(result, null, 2))
    } else {
      console.log(`${result.thread_id}\t${result.status}`)
      if (result.entity_references_count !== undefined) {
        console.log(`  entity_references: ${result.entity_references_count}`)
      }
      if (result.total_relations_count !== undefined) {
        console.log(`  total_relations: ${result.total_relations_count}`)
      }
    }
  } catch (error) {
    console.error(`Error: ${error.message}`)
    exit_code = 1
  }
  flush_and_exit(exit_code)
}
