#!/usr/bin/env node

/**
 * @fileoverview CLI for listing and querying entities
 *
 * Unified CLI for searching and filtering entities from the embedded database.
 * Optimized for agent use with minimal, tab-separated output by default.
 *
 * Usage:
 *   node cli/entity-list.mjs [options]
 *
 * Examples:
 *   # List all tasks
 *   node cli/entity-list.mjs -t task
 *
 *   # Find tasks with specific status
 *   node cli/entity-list.mjs -t task --status "In Progress"
 *
 *   # Get single entity by base_uri
 *   node cli/entity-list.mjs --one --base-uri "user:task/my-task.md"
 *
 *   # Search entities by title
 *   node cli/entity-list.mjs -s "feature"
 */

import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import fs from 'fs/promises'
import path from 'path'

import is_main from '#libs-server/utils/is-main.mjs'
import embedded_index_manager from '#libs-server/embedded-database-index/embedded-index-manager.mjs'
import {
  query_entities_from_duckdb,
  get_entity_by_base_uri,
  get_entity_by_id,
  query_tag_statistics_from_duckdb
} from '#libs-server/embedded-database-index/duckdb/duckdb-table-queries.mjs'
import config from '#config'
import { format_entity } from './base/lib/format.mjs'

const log = debug('cli:entity-list')

/**
 * Read entity content from filesystem
 *
 * @param {string} base_uri - Entity base URI
 * @returns {Promise<string|null>} Entity content or null
 */
async function read_entity_content(base_uri) {
  try {
    // Convert base_uri to filesystem path
    const user_base_directory = config.user_base_directory
    let file_path

    if (base_uri.startsWith('user:')) {
      file_path = path.join(user_base_directory, base_uri.slice(5))
    } else if (base_uri.startsWith('sys:')) {
      file_path = path.join(process.cwd(), base_uri.slice(4))
    } else {
      return null
    }

    const content = await fs.readFile(file_path, 'utf-8')
    return content
  } catch (error) {
    log('Error reading entity content: %s', error.message)
    return null
  }
}

/**
 * Query entities with options
 *
 * @param {Object} options - Query options
 * @returns {Promise<Object[]>} Array of entities
 */
export async function list_entities({
  one = false,
  base_uri,
  entity_id,
  types,
  status,
  priority,
  tags,
  no_tags = false,
  include_archived = false,
  search,
  fields,
  content = false,
  limit = 50,
  offset = 0,
  sort_by = 'updated_at',
  sort_desc = true,
  verbose = false
} = {}) {
  log('Listing entities with options')

  // Initialize the index manager
  await embedded_index_manager.initialize()

  if (!embedded_index_manager.is_ready()) {
    throw new Error(
      'Embedded index manager failed to initialize. Check configuration.'
    )
  }

  // Single entity mode
  if (one) {
    let entity = null

    if (base_uri) {
      entity = await get_entity_by_base_uri({ base_uri })
    } else if (entity_id) {
      entity = await get_entity_by_id({ entity_id })
    }

    if (!entity) {
      return []
    }

    if (content) {
      entity.content = await read_entity_content(entity.base_uri)
    }

    return [entity]
  }

  // Build filters
  const filters = []

  if (types && types.length > 0) {
    filters.push({
      column_id: 'type',
      operator: 'IN',
      value: types
    })
  }

  if (status) {
    filters.push({
      column_id: 'status',
      operator: '=',
      value: status
    })
  }

  if (priority) {
    filters.push({
      column_id: 'priority',
      operator: '=',
      value: priority
    })
  }

  if (!include_archived) {
    filters.push({
      column_id: 'archived',
      operator: '=',
      value: false
    })
  }

  if (search) {
    filters.push({
      column_id: 'title',
      operator: 'LIKE',
      value: search
    })
  }

  // Note: yargs interprets --no-<option> as negating the option, setting it to false
  // We need to check that tags contains actual tag URIs, not just [false]
  if (tags && tags.length > 0 && !no_tags) {
    const valid_tags = tags.filter((t) => typeof t === 'string' && t.length > 0)
    if (valid_tags.length > 0) {
      filters.push({
        column_id: 'tags',
        operator: 'IN',
        value: valid_tags
      })
    }
  }

  if (no_tags) {
    filters.push({
      column_id: 'tags',
      operator: 'IS_EMPTY'
    })
  }

  const sort = sort_by
    ? [{ column_id: sort_by, desc: sort_desc }]
    : [{ column_id: 'updated_at', desc: true }]

  const entities = await query_entities_from_duckdb({
    filters,
    sort,
    limit,
    offset
  })

  // Include content if requested
  if (content) {
    for (const entity of entities) {
      entity.content = await read_entity_content(entity.base_uri)
    }
  }

  return entities
}

// CLI entry point
if (is_main(import.meta.url)) {
  const argv = yargs(hideBin(process.argv))
    .scriptName('entity-list')
    .usage('List and query entities.\n\nUsage: $0 [options]')
    .option('one', {
      describe: 'Fetch single entity',
      type: 'boolean',
      default: false
    })
    .option('base-uri', {
      describe: 'Entity base_uri (for --one mode)',
      type: 'string'
    })
    .option('entity-id', {
      describe: 'Entity UUID (for --one mode)',
      type: 'string'
    })
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
      describe: 'Search term for title/description',
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
      describe: 'Sort ascending (default is descending)',
      type: 'boolean',
      default: false
    })
    .option('verbose', {
      alias: 'v',
      describe: 'Multi-line output',
      type: 'boolean',
      default: false
    })
    .option('json', {
      describe: 'Output as JSON',
      type: 'boolean',
      default: false
    })
    .option('tag-stats', {
      describe: 'Show tag usage statistics (entity counts per tag)',
      type: 'boolean',
      default: false
    })
    .option('include-zero-count', {
      describe: 'Include tags with zero entities (use with --tag-stats)',
      type: 'boolean',
      default: false
    })
    .option('below-threshold', {
      describe: 'Show only tags below this entity count (use with --tag-stats)',
      type: 'number'
    })
    .example('$0 -t task', 'List all tasks')
    .example('$0 -t task --status "In Progress"', 'List in-progress tasks')
    .example('$0 --one --base-uri "user:task/my-task.md"', 'Get single entity')
    .example('$0 -s "feature" -t task', 'Search tasks by title')
    .example('$0 --without-tags -t task', 'List tasks without tags')
    .example('$0 --tag-stats', 'Show entity counts per tag')
    .example(
      '$0 --tag-stats --below-threshold 15',
      'Show tags below minimum threshold'
    )
    .strict()
    .help()
    .alias('help', 'h')
    .parseSync()

  const main = async () => {
    let exit_code = 0

    try {
      // Handle tag statistics mode
      if (argv['tag-stats']) {
        await embedded_index_manager.initialize()

        if (!embedded_index_manager.is_ready()) {
          throw new Error(
            'Embedded index manager failed to initialize. Check configuration.'
          )
        }

        let stats = await query_tag_statistics_from_duckdb({
          include_zero_count: argv['include-zero-count']
        })

        // Filter by threshold if specified
        if (argv['below-threshold'] !== undefined) {
          stats = stats.filter((s) => s.entity_count < argv['below-threshold'])
        }

        if (stats.length === 0) {
          if (!argv.json) {
            console.log('No tags found')
          } else {
            console.log('[]')
          }
        } else if (argv.json) {
          console.log(JSON.stringify(stats, null, 2))
        } else {
          // Calculate column widths for alignment
          const max_count_width = Math.max(
            ...stats.map((s) => String(s.entity_count).length),
            5
          )

          for (const stat of stats) {
            const count_str = String(stat.entity_count).padStart(
              max_count_width
            )
            console.log(`${count_str}\t${stat.tag_base_uri}\t${stat.title}`)
          }

          // Print summary
          console.log('')
          const total_tags = stats.length
          const total_entities = stats.reduce(
            (sum, s) => sum + s.entity_count,
            0
          )
          console.log(
            `Total: ${total_tags} tags, ${total_entities} tag assignments`
          )
        }

        await embedded_index_manager.shutdown()
        process.exit(exit_code)
        return
      }

      const entities = await list_entities({
        one: argv.one,
        base_uri: argv['base-uri'],
        entity_id: argv['entity-id'],
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

      if (entities.length === 0) {
        if (!argv.json) {
          console.log('No entities found')
        } else {
          console.log('[]')
        }
      } else if (argv.json) {
        console.log(JSON.stringify(entities, null, 2))
      } else {
        for (let i = 0; i < entities.length; i++) {
          console.log(
            format_entity(entities[i], {
              verbose: argv.verbose,
              fields: argv.fields
            })
          )
          if (argv.verbose && i < entities.length - 1) {
            console.log('')
          }
        }
      }
    } catch (error) {
      console.error('Error:', error.message)
      exit_code = 1
    }

    // Shutdown the index manager
    await embedded_index_manager.shutdown()
    process.exit(exit_code)
  }

  main()
}

export default list_entities
