/**
 * Relation subcommand group
 *
 * Forward and reverse relation lookups -- first CLI access to this functionality.
 * Tries HTTP API first, falls back to direct DuckDB database access.
 */

import { format_relation, output_results, flush_and_exit } from './lib/format.mjs'
import { query, api_get } from './lib/data-access.mjs'
import { read_entity_from_filesystem } from '#libs-server/entity/filesystem/read-entity-from-filesystem.mjs'
import { write_entity_to_filesystem } from '#libs-server/entity/filesystem/write-entity-to-filesystem.mjs'
import { resolve_base_uri_from_registry } from '#libs-server/base-uri/index.mjs'

export const command = 'relation <command>'
export const describe =
  'Relation operations (list, forward, reverse, add, remove)'

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
    .command(
      'add <source_uri> <relation_type> <target_uri>',
      'Add a relation to an entity',
      (yargs) =>
        yargs
          .positional('source_uri', {
            describe: 'Source entity base_uri',
            type: 'string'
          })
          .positional('relation_type', {
            describe:
              'Relation type (e.g., blocked_by, blocks, precedes, succeeds, relates, subtask_of)',
            type: 'string'
          })
          .positional('target_uri', {
            describe: 'Target entity base_uri',
            type: 'string'
          })
          .option('dry-run', {
            alias: 'n',
            describe: 'Preview changes without executing',
            type: 'boolean',
            default: false
          }),
      handle_add
    )
    .command(
      'remove <source_uri> <relation_type> <target_uri>',
      'Remove a relation from an entity',
      (yargs) =>
        yargs
          .positional('source_uri', {
            describe: 'Source entity base_uri',
            type: 'string'
          })
          .positional('relation_type', {
            describe: 'Relation type to remove',
            type: 'string'
          })
          .positional('target_uri', {
            describe: 'Target entity base_uri',
            type: 'string'
          })
          .option('dry-run', {
            alias: 'n',
            describe: 'Preview changes without executing',
            type: 'boolean',
            default: false
          }),
      handle_remove
    )
    .demandCommand(
      1,
      'Specify a subcommand: list, forward, reverse, add, or remove'
    )

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
  return api_get('/api/entities/relations', params)
}

async function fetch_relations_direct({
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

  await embedded_index_manager.initialize()

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
      result.forward = await embedded_index_manager.find_related_entities(query_params)
      result.counts.forward = result.forward.length
    }

    if (direction === 'reverse' || direction === 'both') {
      result.reverse = await embedded_index_manager.find_entities_relating_to(query_params)
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

    const result = await query(
      () => fetch_relations_from_api(params),
      () => fetch_relations_direct(params)
    )

    // Apply source-type filtering to reverse relations (only reverse has sources)
    if (result.reverse) {
      result.reverse = filter_by_source_type(result.reverse, source_type)
    }

    // Recompute counts after client-side filtering so they match the arrays
    if (result.counts) {
      result.counts = {
        forward: result.forward?.length || 0,
        reverse: result.reverse?.length || 0
      }
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

/**
 * Format a relation string for frontmatter: "relation_type [[target_uri]]"
 */
function format_relation_string(relation_type, target_uri) {
  return `${relation_type} [[${target_uri}]]`
}

async function handle_add(argv) {
  let exit_code = 0
  try {
    const { source_uri, relation_type, target_uri } = argv
    const relation_string = format_relation_string(relation_type, target_uri)

    const absolute_path = resolve_base_uri_from_registry(source_uri)
    const entity_result = await read_entity_from_filesystem({ absolute_path })
    if (!entity_result.success) {
      throw new Error(entity_result.error || 'Source entity not found')
    }

    const props = entity_result.entity_properties
    const relations = Array.isArray(props.relations) ? [...props.relations] : []

    // Check for duplicates
    if (relations.includes(relation_string)) {
      console.log(`Relation already exists: ${relation_string}`)
      flush_and_exit(0)
      return
    }

    if (argv['dry-run']) {
      console.log(`Dry run - would add to ${source_uri}:`)
      console.log(`  ${relation_string}`)
      flush_and_exit(0)
      return
    }

    relations.push(relation_string)
    const merged = {
      ...props,
      relations,
      updated_at: new Date().toISOString()
    }

    await write_entity_to_filesystem({
      absolute_path,
      entity_properties: merged,
      entity_type: props.type,
      entity_content: entity_result.entity_content || ''
    })

    if (argv.json) {
      console.log(
        JSON.stringify(
          { success: true, source_uri, relation: relation_string },
          null,
          2
        )
      )
    } else {
      console.log(`Added relation to ${source_uri}`)
      console.log(`  ${relation_string}`)
    }
  } catch (error) {
    console.error(`Error: ${error.message}`)
    exit_code = 1
  }
  flush_and_exit(exit_code)
}

async function handle_remove(argv) {
  let exit_code = 0
  try {
    const { source_uri, relation_type, target_uri } = argv
    const relation_string = format_relation_string(relation_type, target_uri)

    const absolute_path = resolve_base_uri_from_registry(source_uri)
    const entity_result = await read_entity_from_filesystem({ absolute_path })
    if (!entity_result.success) {
      throw new Error(entity_result.error || 'Source entity not found')
    }

    const props = entity_result.entity_properties
    const relations = Array.isArray(props.relations) ? [...props.relations] : []

    const index = relations.indexOf(relation_string)
    if (index === -1) {
      console.error(`Relation not found: ${relation_string}`)
      flush_and_exit(1)
      return
    }

    if (argv['dry-run']) {
      console.log(`Dry run - would remove from ${source_uri}:`)
      console.log(`  ${relation_string}`)
      flush_and_exit(0)
      return
    }

    relations.splice(index, 1)
    const merged = {
      ...props,
      relations,
      updated_at: new Date().toISOString()
    }

    await write_entity_to_filesystem({
      absolute_path,
      entity_properties: merged,
      entity_type: props.type,
      entity_content: entity_result.entity_content || ''
    })

    if (argv.json) {
      console.log(
        JSON.stringify(
          { success: true, source_uri, removed: relation_string },
          null,
          2
        )
      )
    } else {
      console.log(`Removed relation from ${source_uri}`)
      console.log(`  ${relation_string}`)
    }
  } catch (error) {
    console.error(`Error: ${error.message}`)
    exit_code = 1
  }
  flush_and_exit(exit_code)
}
