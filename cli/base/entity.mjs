/**
 * Entity subcommand group
 *
 * Wraps entity query, get, move, and validate operations.
 */

import { list_entities } from '../entity-list.mjs'
import { move_entity_filesystem } from '#libs-server/entity/filesystem/move-entity-filesystem.mjs'
import { process_repositories_from_filesystem } from '#libs-server/repository/filesystem/process-filesystem-repository.mjs'
import embedded_index_manager from '#libs-server/embedded-database-index/embedded-index-manager.mjs'
import { find_threads_relating_to } from '#libs-server/embedded-database-index/duckdb/duckdb-relation-queries.mjs'
import { query_entities_by_thread_activity } from '#libs-server/embedded-database-index/duckdb/duckdb-activity-queries.mjs'
import {
  parse_time_period_date,
  is_valid_time_period
} from '#libs-server/utils/parse-time-period.mjs'
import {
  SERVER_URL,
  format_entity,
  format_entity_thread,
  output_results,
  with_api_fallback,
  flush_and_exit
} from './lib/format.mjs'
import { authenticated_fetch } from './lib/auth.mjs'

export const command = 'entity <command>'
export const describe = 'Entity operations (list, get, move, validate)'

export const builder = (yargs) =>
  yargs
    .command(
      'list',
      'Query entities with filters',
      (yargs) =>
        yargs
          .option('type', {
            alias: 't',
            describe: 'Entity type(s)',
            type: 'array'
          })
          .option('status', {
            describe: 'Status filter',
            type: 'string'
          })
          .option('priority', {
            describe: 'Priority filter',
            type: 'string'
          })
          .option('tags', {
            describe: 'Tag base_uris',
            type: 'array'
          })
          .option('without-tags', {
            describe: 'Return only entities without tags',
            type: 'boolean',
            default: false
          })
          .option('archived', {
            describe: 'Include archived entities',
            type: 'boolean',
            default: false
          })
          .option('search', {
            alias: 's',
            describe: 'Search term for title',
            type: 'string'
          })
          .option('fields', {
            alias: 'f',
            describe: 'Fields to return',
            type: 'array'
          })
          .option('content', {
            describe: 'Include entity content',
            type: 'boolean',
            default: false
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
          })
          .option('sort', {
            describe: 'Sort field',
            type: 'string',
            default: 'updated_at'
          })
          .option('asc', {
            describe: 'Sort ascending',
            type: 'boolean',
            default: false
          })
          .option('recently-active', {
            describe: 'Filter by recent thread activity (e.g., 24h, 7d, 2w)',
            type: 'string'
          }),
      handle_list
    )
    .command(
      'get <base_uri>',
      'Get single entity by base_uri',
      (yargs) =>
        yargs.positional('base_uri', {
          describe: 'Entity base_uri',
          type: 'string'
        }),
      handle_get
    )
    .command(
      'move <source> <destination>',
      'Move entity and update references',
      (yargs) =>
        yargs
          .positional('source', {
            describe: 'Source path or base_uri',
            type: 'string'
          })
          .positional('destination', {
            describe: 'Destination path or base_uri',
            type: 'string'
          })
          .option('dry-run', {
            alias: 'n',
            describe: 'Preview changes without executing',
            type: 'boolean',
            default: false
          })
          .option('include-path-patterns', {
            alias: 'i',
            describe: 'Limit reference scan to matching paths',
            type: 'array',
            default: []
          })
          .option('exclude-path-patterns', {
            alias: 'e',
            describe: 'Exclude paths from reference scan',
            type: 'array',
            default: []
          }),
      handle_move
    )
    .command(
      'validate',
      'Validate markdown entities against schemas',
      (yargs) =>
        yargs
          .option('include-path-patterns', {
            alias: 'i',
            describe: 'Glob patterns to include',
            type: 'array',
            default: []
          })
          .option('exclude-path-patterns', {
            alias: 'e',
            describe: 'Glob patterns to exclude',
            type: 'array',
            default: []
          }),
      handle_validate
    )
    .command(
      'threads <base_uri>',
      'Show threads that have worked on or referenced an entity',
      (yargs) =>
        yargs
          .positional('base_uri', {
            describe: 'Entity base_uri to find related threads for',
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
      handle_threads
    )
    .demandCommand(
      1,
      'Specify a subcommand: list, get, move, validate, or threads'
    )

export const handler = () => {}

async function fetch_entities_from_api(argv) {
  const params = new URLSearchParams()
  if (argv.type) {
    for (const t of argv.type) params.append('type', t)
  }
  if (argv.status) params.set('status', argv.status)
  if (argv.priority) params.set('priority', argv.priority)
  if (argv.tags) {
    for (const tag of argv.tags) params.append('tags', tag)
  }
  if (argv['without-tags']) params.set('no_tags', 'true')
  if (argv.archived) params.set('include_archived', 'true')
  if (argv.search) params.set('search', argv.search)
  if (argv.content) params.set('content', 'true')
  if (argv.limit) params.set('limit', String(argv.limit))
  if (argv.offset) params.set('offset', String(argv.offset))
  if (argv.sort) params.set('sort_by', argv.sort)
  if (!argv.asc) params.set('sort_desc', 'true')

  const response = await authenticated_fetch(
    `${SERVER_URL}/api/entities?${params}`
  )
  if (!response.ok) throw new Error(`API returned ${response.status}`)
  const data = await response.json()
  return data.entities || data
}

async function handle_list(argv) {
  let exit_code = 0
  try {
    let entities

    // Handle recently-active filter (uses separate query)
    if (argv['recently-active']) {
      const period = argv['recently-active']
      if (!is_valid_time_period(period)) {
        throw new Error(
          `Invalid period format: ${period}. Use format like 24h, 7d, 2w, 1m`
        )
      }

      const since_date = parse_time_period_date(period)
      await embedded_index_manager.initialize()

      entities = await query_entities_by_thread_activity({
        since_date,
        entity_types: argv.type || null,
        limit: argv.limit,
        offset: argv.offset
      })
    } else {
      entities = await with_api_fallback(
        () => fetch_entities_from_api(argv),
        () =>
          list_entities({
            types: argv.type,
            status: argv.status,
            priority: argv.priority,
            tags: argv.tags,
            no_tags: argv['without-tags'],
            include_archived: argv.archived,
            search: argv.search,
            fields: argv.fields,
            content: argv.content,
            limit: argv.limit,
            offset: argv.offset,
            sort_by: argv.sort,
            sort_desc: !argv.asc,
            verbose: argv.verbose
          })
      )
    }

    output_results(entities, {
      json: argv.json,
      verbose: argv.verbose,
      formatter: (entity) =>
        format_entity(entity, { verbose: argv.verbose, fields: argv.fields }),
      empty_message: 'No entities found'
    })
  } catch (error) {
    console.error(`Error: ${error.message}`)
    exit_code = 1
  } finally {
    await embedded_index_manager.shutdown()
  }
  flush_and_exit(exit_code)
}

async function handle_get(argv) {
  let exit_code = 0
  try {
    const entities = await with_api_fallback(
      async () => {
        const params = new URLSearchParams({
          base_uri: argv.base_uri,
          content: 'true'
        })
        const response = await authenticated_fetch(
          `${SERVER_URL}/api/entities?${params}`
        )
        if (!response.ok) throw new Error(`API returned ${response.status}`)
        const data = await response.json()
        return data.entities || data
      },
      () =>
        list_entities({
          one: true,
          base_uri: argv.base_uri,
          content: true
        })
    )

    const verbose = argv.verbose !== undefined ? argv.verbose : true
    output_results(entities, {
      json: argv.json,
      verbose,
      formatter: (entity) => format_entity(entity, { verbose }),
      empty_message: `Entity not found: ${argv.base_uri}`
    })
  } catch (error) {
    console.error(`Error: ${error.message}`)
    exit_code = 1
  } finally {
    await embedded_index_manager.shutdown()
  }
  flush_and_exit(exit_code)
}

async function handle_move(argv) {
  let exit_code = 0
  try {
    const result = await move_entity_filesystem({
      source_path: argv.source,
      destination_path: argv.destination,
      dry_run: argv['dry-run'],
      include_path_patterns: argv['include-path-patterns'],
      exclude_path_patterns: argv['exclude-path-patterns']
    })

    if (argv.json) {
      console.log(JSON.stringify(result, null, 2))
    } else {
      if (result.dry_run) {
        console.log('Dry run - no changes made')
      } else if (result.success) {
        console.log('Entity moved successfully')
      } else {
        console.log('Move operation failed')
      }
      console.log(`Source: ${result.source_base_uri}`)
      console.log(`Destination: ${result.destination_base_uri}`)
      console.log(
        `Entity reference updates: ${result.entity_reference_updates}`
      )
      if (result.errors.length > 0) {
        for (const err of result.errors) {
          console.error(`  Error: ${err}`)
        }
      }
    }

    if (!result.success) {
      exit_code = 1
    }
  } catch (error) {
    console.error(`Error: ${error.message}`)
    exit_code = 1
  }
  flush_and_exit(exit_code)
}

async function handle_validate(argv) {
  let exit_code = 0
  try {
    const result = await process_repositories_from_filesystem({
      include_path_patterns: argv['include-path-patterns'],
      exclude_path_patterns: argv['exclude-path-patterns']
    })

    if (argv.json) {
      console.log(JSON.stringify(result, null, 2))
    } else {
      console.log(`Total: ${result.total}`)
      console.log(`Validated: ${result.processed}`)
      console.log(`Skipped: ${result.skipped}`)
      console.log(`Errors: ${result.errors}`)

      for (const file of result.files) {
        if (file.errors && file.errors.length > 0) {
          console.error(`\n${file.base_uri || file.absolute_path}`)
          for (const err of file.errors) {
            console.error(`  ${err}`)
          }
        }
      }
    }

    if (result.errors > 0) {
      exit_code = 1
    }
  } catch (error) {
    console.error(`Error: ${error.message}`)
    exit_code = 1
  }
  flush_and_exit(exit_code)
}

async function fetch_entity_threads_from_api(argv) {
  const params = new URLSearchParams()
  params.set('base_uri', argv.base_uri)
  if (argv['relation-type']) params.set('relation_type', argv['relation-type'])
  params.set('limit', String(argv.limit))
  params.set('offset', String(argv.offset))

  const response = await authenticated_fetch(
    `${SERVER_URL}/api/entities/threads?${params}`
  )
  if (!response.ok) throw new Error(`API returned ${response.status}`)
  const data = await response.json()
  return data.threads || data
}

async function handle_threads(argv) {
  let exit_code = 0
  try {
    const threads = await with_api_fallback(
      () => fetch_entity_threads_from_api(argv),
      async () => {
        // Initialize embedded index for direct DuckDB access
        await embedded_index_manager.ensure_ready()
        return find_threads_relating_to({
          base_uri: argv.base_uri,
          relation_type: argv['relation-type'] || null,
          limit: argv.limit,
          offset: argv.offset
        })
      }
    )

    output_results(threads, {
      json: argv.json,
      verbose: argv.verbose,
      formatter: (thread) =>
        format_entity_thread(thread, { verbose: argv.verbose }),
      empty_message: `No threads found for entity: ${argv.base_uri}`
    })
  } catch (error) {
    console.error(`Error: ${error.message}`)
    exit_code = 1
  } finally {
    await embedded_index_manager.shutdown()
  }
  flush_and_exit(exit_code)
}
