/**
 * Relation subcommand group
 *
 * Forward and reverse relation lookups -- first CLI access to this functionality.
 * Tries HTTP API first, falls back to direct DuckDB database access.
 */

import {
  SERVER_URL,
  format_relation,
  output_results,
  with_api_fallback,
  flush_and_exit
} from './lib/format.mjs'
import { authenticated_fetch } from './lib/auth.mjs'

export const command = 'relation <command>'
export const describe = 'Relation lookups (list, forward, reverse)'

const relation_options = (yargs) =>
  yargs
    .option('relation-type', {
      describe: 'Filter by relation type',
      type: 'string'
    })
    .option('entity-type', {
      describe: 'Filter by target entity type',
      type: 'string'
    })
    .option('limit', {
      alias: 'l',
      describe: 'Max results',
      type: 'number',
      default: 100
    })
    .option('offset', {
      describe: 'Offset for pagination',
      type: 'number',
      default: 0
    })

/**
 * Additional options for commands that return reverse relations (sources)
 */
const reverse_source_options = (yargs) =>
  yargs.option('source-type', {
    describe: 'Filter by source type: entity, thread, or all',
    type: 'string',
    choices: ['entity', 'thread', 'all'],
    default: 'all'
  })

export const builder = (yargs) =>
  yargs
    .command(
      'list <base_uri>',
      'List both forward and reverse relations',
      (yargs) =>
        reverse_source_options(
          relation_options(
            yargs.positional('base_uri', {
              describe: 'Entity base_uri',
              type: 'string'
            })
          )
        ),
      (argv) => handle_relations(argv, 'both')
    )
    .command(
      'forward <base_uri>',
      'List forward relations only',
      (yargs) =>
        relation_options(
          yargs.positional('base_uri', {
            describe: 'Entity base_uri',
            type: 'string'
          })
        ),
      (argv) => handle_relations(argv, 'forward')
    )
    .command(
      'reverse <base_uri>',
      'List reverse relations only',
      (yargs) =>
        reverse_source_options(
          relation_options(
            yargs.positional('base_uri', {
              describe: 'Entity base_uri',
              type: 'string'
            })
          )
        ),
      (argv) => handle_relations(argv, 'reverse')
    )
    .demandCommand(1, 'Specify a subcommand: list, forward, or reverse')

export const handler = () => {}

/**
 * Check if a base_uri represents a thread
 */
function is_thread_source(base_uri) {
  return base_uri && base_uri.startsWith('user:thread/')
}

/**
 * Filter relations by source type
 */
function filter_by_source_type(relations, source_type) {
  if (!source_type || source_type === 'all') {
    return relations
  }
  return relations.filter((rel) => {
    const is_thread = is_thread_source(rel.base_uri)
    return source_type === 'thread' ? is_thread : !is_thread
  })
}

/**
 * Get source type label for a relation
 */
function get_source_type_label(base_uri) {
  return is_thread_source(base_uri) ? 'thread' : 'entity'
}

async function fetch_relations_from_api({
  base_uri,
  direction,
  relation_type,
  entity_type,
  limit,
  offset
}) {
  const params = new URLSearchParams({ base_uri, direction })
  if (relation_type) params.set('relation_type', relation_type)
  if (entity_type) params.set('entity_type', entity_type)
  if (limit) params.set('limit', String(limit))
  if (offset) params.set('offset', String(offset))

  const response = await authenticated_fetch(
    `${SERVER_URL}/api/entities/relations?${params}`
  )
  if (!response.ok) {
    throw new Error(`API returned ${response.status}`)
  }
  return response.json()
}

async function fetch_relations_from_duckdb({
  base_uri,
  direction,
  relation_type,
  entity_type,
  limit,
  offset
}) {
  const embedded_index_manager = (
    await import(
      '#libs-server/embedded-database-index/embedded-index-manager.mjs'
    )
  ).default
  const { find_related_entities, find_entities_relating_to } = await import(
    '#libs-server/embedded-database-index/duckdb/duckdb-relation-queries.mjs'
  )

  await embedded_index_manager.initialize()

  if (!embedded_index_manager.is_ready()) {
    throw new Error('Embedded index manager failed to initialize')
  }

  const query_params = {
    base_uri,
    relation_type: relation_type || null,
    entity_type: entity_type || null,
    limit,
    offset
  }

  const result = { forward: [], reverse: [], counts: {} }

  try {
    if (direction === 'forward' || direction === 'both') {
      result.forward = await find_related_entities(query_params)
      result.counts.forward = result.forward.length
    }

    if (direction === 'reverse' || direction === 'both') {
      result.reverse = await find_entities_relating_to(query_params)
      result.counts.reverse = result.reverse.length
    }
  } finally {
    await embedded_index_manager.shutdown()
  }

  return result
}

async function handle_relations(argv, direction) {
  let exit_code = 0
  try {
    const params = {
      base_uri: argv.base_uri,
      direction,
      relation_type: argv['relation-type'],
      entity_type: argv['entity-type'],
      limit: argv.limit,
      offset: argv.offset
    }

    const source_type = argv['source-type']

    const result = await with_api_fallback(
      () => fetch_relations_from_api(params),
      () => fetch_relations_from_duckdb(params)
    )

    // Apply source-type filtering to reverse relations (only reverse has sources)
    if (result.reverse) {
      result.reverse = filter_by_source_type(result.reverse, source_type)
    }

    // Custom formatter that includes source type indicator
    const format_with_source_type = (relation, options) => {
      if (options.verbose) {
        const source_label = get_source_type_label(relation.base_uri)
        const lines = [relation.base_uri]
        lines.push(`  source_type: ${source_label}`)
        if (relation.relation_type) {
          lines.push(`  relation_type: ${relation.relation_type}`)
        }
        if (relation.title) lines.push(`  title: ${relation.title}`)
        if (relation.type) lines.push(`  type: ${relation.type}`)
        if (relation.context) lines.push(`  context: ${relation.context}`)
        return lines.join('\n')
      }

      const source_label = get_source_type_label(relation.base_uri)
      return [
        source_label,
        relation.relation_type || '',
        relation.base_uri || '',
        relation.title || '',
        relation.type || ''
      ].join('\t')
    }

    if (argv.json) {
      // Add source_type to each relation in JSON output
      if (result.reverse) {
        result.reverse = result.reverse.map((rel) => ({
          ...rel,
          source_type: get_source_type_label(rel.base_uri)
        }))
      }
      console.log(JSON.stringify(result, null, 2))
    } else {
      const has_forward = result.forward && result.forward.length > 0
      const has_reverse = result.reverse && result.reverse.length > 0

      if (!has_forward && !has_reverse) {
        console.log('No relations found')
      } else {
        if (has_forward) {
          if (direction === 'both') console.log('Forward:')
          output_results(result.forward, {
            verbose: argv.verbose,
            formatter: format_relation
          })
        }

        if (has_forward && has_reverse) console.log('')

        if (has_reverse) {
          if (direction === 'both') console.log('Reverse:')
          output_results(result.reverse, {
            verbose: argv.verbose,
            formatter: format_with_source_type
          })
        }
      }
    }
  } catch (error) {
    console.error(`Error: ${error.message}`)
    exit_code = 1
  }
  flush_and_exit(exit_code)
}
