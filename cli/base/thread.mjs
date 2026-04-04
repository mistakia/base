/**
 * Thread subcommand group
 *
 * Wraps thread query, archive, and analysis operations.
 */

import path from 'path'

import { update_thread_state } from '#libs-server/threads/update-thread.mjs'
import { analyze_thread_relations } from '#libs-server/metadata/analyze-thread-relations.mjs'
import { read_thread_data } from '#libs-server/threads/thread-utils.mjs'
import get_thread from '#libs-server/threads/get-thread.mjs'
import { create_base_uri_from_path } from '#libs-server/base-uri/base-uri-utilities.mjs'
import { thread_constants } from '#libs-shared'
import list_threads from '#libs-server/threads/list-threads.mjs'
import {
  flush_and_exit,
  format_thread,
  format_thread_status,
  format_timeline_entry
} from './lib/format.mjs'
import { query, api_get } from './lib/data-access.mjs'

const { THREAD_STATE, ARCHIVE_REASON } = thread_constants

/**
 * Resolve a file or directory reference for thread search.
 * If the input is an absolute path, extract the relative path within the
 * repository for broad LIKE matching. This matches references stored under
 * different URI schemes (sys:, user:) and worktree paths.
 * Otherwise return the input as-is for pattern matching.
 */
function resolve_ref_pattern(ref) {
  if (!ref) return ref
  if (path.isAbsolute(ref)) {
    try {
      const base_uri = create_base_uri_from_path(ref)
      // Extract just the path portion after the scheme prefix (e.g., "cli/file.mjs")
      const colon_index = base_uri.indexOf(':')
      return colon_index >= 0 ? base_uri.slice(colon_index + 1) : base_uri
    } catch {
      // Path outside managed repositories - fall back to basename
      return path.basename(ref)
    }
  }
  return ref
}

export const command = 'thread <command>'
export const describe =
  'Thread operations (list, get, status, timeline, archive, analyze)'

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
            describe:
              'Filter by file reference (base URI pattern, filename, or absolute path)',
            type: 'string'
          })
          .option('dir-ref', {
            describe:
              'Filter by directory reference (base URI pattern, name, or absolute path)',
            type: 'string'
          })
          .option('tags', {
            describe:
              'Filter by tag base_uri(s), comma-separated (e.g., user:tag/project.md)',
            type: 'string'
          })
          .option('without-tags', {
            describe: 'Return only threads without tags',
            type: 'boolean',
            default: false
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
    .command(
      'get <thread_id>',
      'Get thread metadata by ID',
      (yargs) =>
        yargs
          .positional('thread_id', {
            describe: 'Thread ID',
            type: 'string'
          })
          .option('include-timeline', {
            describe: 'Include timeline data',
            type: 'boolean',
            default: false
          })
          .option('json', {
            describe: 'Output as JSON',
            type: 'boolean',
            default: false
          })
          .option('verbose', {
            alias: 'v',
            describe: 'Detailed multi-line output',
            type: 'boolean',
            default: false
          }),
      handle_get
    )
    .command(
      'status <thread_id>',
      'Show thread work context (initial intent, current state)',
      (yargs) =>
        yargs
          .positional('thread_id', {
            describe: 'Thread ID',
            type: 'string'
          })
          .option('relations', {
            describe: 'Include relation summary',
            type: 'boolean',
            default: false
          })
          .option('tools', {
            describe: 'Include tool call aggregation',
            type: 'boolean',
            default: false
          })
          .option('max-length', {
            describe: 'Max content length for truncation',
            type: 'number',
            default: 500
          })
          .option('json', {
            describe: 'Output as JSON',
            type: 'boolean',
            default: false
          })
          .option('verbose', {
            alias: 'v',
            describe: 'Detailed multi-line output',
            type: 'boolean',
            default: false
          }),
      handle_status
    )
    .command(
      'timeline <thread_id>',
      'Query timeline events',
      (yargs) =>
        yargs
          .positional('thread_id', {
            describe: 'Thread ID',
            type: 'string'
          })
          .option('last', {
            describe: 'Take last N entries',
            type: 'number'
          })
          .option('first', {
            describe: 'Take first N entries',
            type: 'number'
          })
          .option('type', {
            describe: 'Filter by event type (comma-separated)',
            type: 'string'
          })
          .option('role', {
            describe: 'Filter by message role (comma-separated)',
            type: 'string'
          })
          .option('tool', {
            describe: 'Filter by tool name (comma-separated)',
            type: 'string'
          })
          .option('limit', {
            describe:
              'Limit number of timeline entries (default 50 when no other slicing options are used)',
            type: 'number'
          })
          .option('include-sidechain', {
            describe: 'Include sidechain timeline entries',
            type: 'boolean',
            default: false
          })
          .option('json', {
            describe: 'Output as JSON',
            type: 'boolean',
            default: false
          })
          .option('verbose', {
            alias: 'v',
            describe: 'Detailed multi-line output',
            type: 'boolean',
            default: false
          }),
      handle_timeline
    )
    .command(
      'messages <thread_id>',
      'Read thread conversation messages',
      (yargs) =>
        yargs
          .positional('thread_id', {
            describe: 'Thread ID',
            type: 'string'
          })
          .option('role', {
            describe: 'Filter by message role (user or assistant)',
            type: 'string'
          })
          .option('last', {
            describe: 'Show last N messages',
            type: 'number'
          })
          .option('first', {
            describe: 'Show first N messages',
            type: 'number'
          })
          .option('json', {
            describe: 'Output as JSON',
            type: 'boolean',
            default: false
          }),
      handle_messages
    )
    .command(
      'stale',
      'List active threads with no recent activity',
      (yargs) =>
        yargs
          .option('days', {
            alias: 'd',
            describe: 'Days threshold for staleness',
            type: 'number',
            default: 7
          })
          .option('limit', {
            alias: 'l',
            describe: 'Max results',
            type: 'number',
            default: 50
          })
          .option('json', {
            describe: 'Output as JSON',
            type: 'boolean',
            default: false
          }),
      handle_stale
    )
    .demandCommand(
      1,
      'Specify a subcommand: list, get, status, timeline, messages, stale, archive, or analyze'
    )

export const handler = () => {}

async function handle_list(argv) {
  let exit_code = 0
  try {
    const params = new URLSearchParams()
    if (argv.state) params.set('thread_state', argv.state)
    if (argv.search) params.set('search', argv.search)
    if (argv['file-ref'])
      params.set('file_ref', resolve_ref_pattern(argv['file-ref']))
    if (argv['dir-ref'])
      params.set('dir_ref', resolve_ref_pattern(argv['dir-ref']))
    if (argv.tags) params.set('tags', argv.tags)
    if (argv['without-tags']) params.set('without_tags', 'true')
    if (argv['relates-to']) params.set('relates_to', argv['relates-to'])
    if (argv['relation-type'])
      params.set('relation_type', argv['relation-type'])
    params.set('limit', String(argv.limit))
    params.set('offset', String(argv.offset))
    params.set('include_timeline', 'false')

    const is_relation_query = Boolean(argv['relates-to'])

    const threads = await query(
      async () => api_get('/api/threads', params),
      async () =>
        list_threads({
          thread_state: argv.state || null,
          limit: argv.limit,
          offset: argv.offset
        })
    )

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

async function handle_get(argv) {
  let exit_code = 0
  try {
    let thread_data

    if (argv['include-timeline']) {
      // Use get_thread() for full data with timeline
      thread_data = await get_thread({ thread_id: argv.thread_id })
    } else {
      // Use read_thread_data() for metadata only
      const { metadata, thread_dir } = await read_thread_data({
        thread_id: argv.thread_id
      })
      thread_data = {
        thread_id: argv.thread_id,
        ...metadata,
        context_dir: thread_dir
      }
    }

    if (argv.json) {
      console.log(JSON.stringify(thread_data, null, 2))
    } else {
      console.log(format_thread(thread_data, { verbose: argv.verbose }))
    }
  } catch (error) {
    console.error(`Error: ${error.message}`)
    exit_code = 1
  }
  flush_and_exit(exit_code)
}

async function handle_status(argv) {
  let exit_code = 0
  try {
    // Single fetch with conditional types to avoid double I/O
    const include_types = argv.tools ? ['message', 'tool_call'] : ['message']
    const thread_data = await get_thread({
      thread_id: argv.thread_id,
      include_types
    })

    const timeline = thread_data.timeline || []

    // Single-pass extraction of first/last messages
    let first_user_message = null
    let last_user_message = null
    let last_assistant_message = null
    const tool_counts = {}

    for (const entry of timeline) {
      if (entry.type === 'message') {
        if (entry.role === 'user') {
          if (!first_user_message) first_user_message = entry
          last_user_message = entry
        } else if (entry.role === 'assistant') {
          last_assistant_message = entry
        }
      } else if (argv.tools && entry.type === 'tool_call') {
        const tool_name = entry.tool_name || 'unknown'
        tool_counts[tool_name] = (tool_counts[tool_name] || 0) + 1
      }
    }

    const status_data = {
      thread_id: argv.thread_id,
      thread_state: thread_data.thread_state,
      title: thread_data.title,
      first_user_message,
      last_user_message:
        last_user_message !== first_user_message ? last_user_message : null,
      last_assistant_message
    }

    // Optionally include relations
    if (argv.relations && thread_data.relations) {
      status_data.relations = thread_data.relations
    }

    // Include tool counts if requested
    if (argv.tools) {
      status_data.tool_counts = tool_counts
    }

    if (argv.json) {
      console.log(JSON.stringify(status_data, null, 2))
    } else {
      console.log(
        format_thread_status(status_data, {
          verbose: argv.verbose,
          max_length: argv['max-length']
        })
      )
    }
  } catch (error) {
    console.error(`Error: ${error.message}`)
    exit_code = 1
  }
  flush_and_exit(exit_code)
}

// Helper to parse comma-separated values
function parse_csv(value) {
  if (!value) return []
  return value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

async function handle_timeline(argv) {
  let exit_code = 0
  try {
    const params = {
      thread_id: argv.thread_id
    }

    // Map CLI options to get_thread parameters
    if (argv.last) params.take_last = argv.last
    if (argv.first) params.take_first = argv.first
    if (argv.type) params.include_types = parse_csv(argv.type)
    if (argv.role) params.include_roles = parse_csv(argv.role)
    if (argv.tool) params.include_tool_names = parse_csv(argv.tool)
    if (argv.limit !== undefined) params.limit = argv.limit

    // Apply task-intent defaults when no explicit type filter is provided
    if (!argv.type && !params.include_types) {
      params.include_types = ['message', 'tool_call']
    }

    // Default to excluding sidechain entries unless explicitly requested
    params.include_sidechain = argv['include-sidechain']

    // Apply a sensible default limit when no other slicing options are used
    if (
      params.limit === undefined &&
      params.take_last === undefined &&
      params.take_first === undefined
    ) {
      params.limit = 50
    }

    const thread_data = await get_thread(params)
    const timeline = thread_data.timeline || []

    if (argv.json) {
      console.log(JSON.stringify(timeline, null, 2))
    } else if (timeline.length === 0) {
      console.log('No timeline entries found')
    } else {
      for (const entry of timeline) {
        console.log(format_timeline_entry(entry, { verbose: argv.verbose }))
      }
    }
  } catch (error) {
    console.error(`Error: ${error.message}`)
    exit_code = 1
  }
  flush_and_exit(exit_code)
}

/**
 * Extract text content from a message entry.
 * Handles both string content and structured content arrays.
 */
function extract_message_text(entry) {
  const content = entry.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
  }
  return String(content || '')
}

async function handle_messages(argv) {
  let exit_code = 0
  try {
    const params = {
      thread_id: argv.thread_id,
      include_types: ['message']
    }

    if (argv.role) params.include_roles = [argv.role]
    if (argv.last) params.take_last = argv.last
    if (argv.first) params.take_first = argv.first

    const thread_data = await get_thread(params)
    const messages = (thread_data.timeline || []).filter(
      (e) => e.type === 'message'
    )

    if (argv.json) {
      console.log(JSON.stringify(messages, null, 2))
    } else if (messages.length === 0) {
      console.log('No messages found')
    } else {
      for (const msg of messages) {
        const role_label = msg.role === 'user' ? '[user]' : '[assistant]'
        const text = extract_message_text(msg)
        console.log(`${role_label} ${text}`)
        console.log()
      }
    }
  } catch (error) {
    console.error(`Error: ${error.message}`)
    exit_code = 1
  }
  flush_and_exit(exit_code)
}

async function handle_stale(argv) {
  let exit_code = 0
  try {
    const threshold_ms = argv.days * 24 * 60 * 60 * 1000
    const now = Date.now()

    // Fetch active threads
    const params = new URLSearchParams({
      thread_state: 'active',
      include_timeline: 'false',
      limit: String(argv.limit),
      offset: '0'
    })

    const threads = await query(
      async () => api_get('/api/threads', params),
      async () =>
        list_threads({
          thread_state: 'active',
          limit: argv.limit
        })
    )

    if (!threads || threads.length === 0) {
      if (argv.json) {
        console.log('[]')
      } else {
        console.log('No active threads found')
      }
      flush_and_exit(0)
      return
    }

    // Filter to stale threads
    const stale_threads = threads
      .map((thread) => {
        const updated = thread.updated_at || thread.created_at
        const updated_ms = updated ? new Date(updated).getTime() : 0
        const days_stale = Math.floor(
          (now - updated_ms) / (24 * 60 * 60 * 1000)
        )
        return { ...thread, days_stale }
      })
      .filter(
        (thread) =>
          now - new Date(thread.updated_at || thread.created_at).getTime() >=
          threshold_ms
      )
      .sort((a, b) => b.days_stale - a.days_stale)

    if (argv.json) {
      console.log(JSON.stringify(stale_threads, null, 2))
    } else if (stale_threads.length === 0) {
      console.log(`No threads stale for ${argv.days}+ days`)
    } else {
      for (const thread of stale_threads) {
        const title = thread.title || '(no title)'
        console.log(`${thread.thread_id}\t${thread.days_stale}d\t${title}`)
      }
    }
  } catch (error) {
    console.error(`Error: ${error.message}`)
    exit_code = 1
  }
  flush_and_exit(exit_code)
}
