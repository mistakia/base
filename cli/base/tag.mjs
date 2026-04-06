/**
 * Tag subcommand group
 *
 * Wraps tag listing, statistics, and batch management operations.
 */

import { list_entities } from '#cli/entity-list.mjs'
import embedded_index_manager from '#libs-server/embedded-database-index/embedded-index-manager.mjs'
import { resolve_tag_shorthand } from '#libs-server/tag/filesystem/resolve-tag-shorthand.mjs'
import { tag_exists_in_filesystem } from '#libs-server/tag/filesystem/tag-exists-in-filesystem.mjs'
import { process_tag_batch } from '#libs-server/tag/filesystem/process-tag-batch.mjs'
import { flush_and_exit } from './lib/format.mjs'
import { query, api_get } from './lib/data-access.mjs'

export const command = 'tag <command>'
export const describe = 'Tag operations (list, stats, add, remove)'

export const builder = (yargs) =>
  yargs
    .command(
      'list',
      'List all tags',
      (yargs) =>
        yargs.option('search', {
          alias: 's',
          describe: 'Search tags by term',
          type: 'string'
        }),
      handle_list
    )
    .command(
      'stats',
      'Tag usage statistics',
      (yargs) =>
        yargs
          .option('below-threshold', {
            describe: 'Show only tags below this entity count',
            type: 'number'
          })
          .option('include-zero-count', {
            describe: 'Include tags with zero entities',
            type: 'boolean',
            default: false
          })
          .option('json', {
            describe: 'Output as JSON',
            type: 'boolean',
            default: false
          }),
      handle_stats
    )
    .command(
      'add',
      'Batch add tags to entities',
      tag_mutation_options,
      (argv) => handle_tag_mutation(argv, 'add')
    )
    .command(
      'remove',
      'Batch remove tags from entities',
      tag_mutation_options,
      (argv) => handle_tag_mutation(argv, 'remove')
    )
    .demandCommand(1, 'Specify a subcommand: list, stats, add, or remove')

export const handler = () => {}

function tag_mutation_options(yargs) {
  return yargs
    .option('tag', {
      alias: 't',
      describe: 'Tag(s) to apply (shorthand or base_uri, comma-separated)',
      type: 'string',
      demandOption: true
    })
    .option('include-path-patterns', {
      alias: 'i',
      describe: 'Glob patterns to match files',
      type: 'array',
      default: ['*.md']
    })
    .option('exclude-path-patterns', {
      alias: 'e',
      describe: 'Glob patterns to exclude files',
      type: 'array',
      default: []
    })
    .option('dry-run', {
      alias: 'n',
      describe: 'Preview changes without modifying',
      type: 'boolean',
      default: false
    })
}

async function handle_list(argv) {
  let exit_code = 0
  try {
    const tags = await query(
      async () => {
        const params = new URLSearchParams()
        if (argv.search) params.set('search_term', argv.search)
        return api_get('/api/tags', params)
      },
      async () =>
        list_entities({
          types: ['tag'],
          search: argv.search,
          limit: 1000
        })
    )

    if (!tags || tags.length === 0) {
      if (argv.json) {
        console.log('[]')
      } else {
        console.log('No tags found')
      }
    } else if (argv.json) {
      console.log(JSON.stringify(tags, null, 2))
    } else {
      for (const tag of tags) {
        console.log(`${tag.base_uri}\t${tag.title || ''}`)
      }
    }
  } catch (error) {
    console.error(`Error: ${error.message}`)
    exit_code = 1
  } finally {
    await embedded_index_manager.shutdown()
  }
  flush_and_exit(exit_code)
}

async function handle_stats(argv) {
  let exit_code = 0
  try {
    await embedded_index_manager.initialize()

    let stats = await embedded_index_manager.query_tag_statistics({
      include_zero_count: argv['include-zero-count']
    })

    if (argv['below-threshold'] !== undefined) {
      stats = stats.filter((s) => s.entity_count < argv['below-threshold'])
    }

    if (argv.json) {
      console.log(JSON.stringify(stats, null, 2))
    } else if (stats.length === 0) {
      console.log('No tags found')
    } else {
      const entity_width = Math.max(
        ...stats.map((s) => String(s.entity_count).length),
        8
      )
      const thread_width = Math.max(
        ...stats.map((s) => String(s.thread_count).length),
        7
      )
      for (const stat of stats) {
        console.log(
          `${String(stat.entity_count).padStart(entity_width)}\t${String(stat.thread_count).padStart(thread_width)}\t${stat.tag_base_uri}\t${stat.title}`
        )
      }
      const total_entities = stats.reduce((sum, s) => sum + s.entity_count, 0)
      const total_threads = stats.reduce((sum, s) => sum + s.thread_count, 0)
      console.log(
        `\nTotal: ${stats.length} tags, ${total_entities} entity assignments, ${total_threads} thread assignments`
      )
    }
  } catch (error) {
    console.error(`Error: ${error.message}`)
    exit_code = 1
  } finally {
    await embedded_index_manager.shutdown()
  }
  flush_and_exit(exit_code)
}

async function handle_tag_mutation(argv, operation) {
  let exit_code = 0
  try {
    const resolved_tags = resolve_tag_shorthand(argv.tag)

    const validation_results = await Promise.all(
      resolved_tags.map(async (tag) => {
        const exists = await tag_exists_in_filesystem({ base_uri: tag })
        return { tag, exists }
      })
    )

    const missing_tags = validation_results.filter((r) => !r.exists)
    if (missing_tags.length > 0) {
      throw new Error(
        `Tags do not exist: ${missing_tags.map((t) => t.tag).join(', ')}`
      )
    }

    const result = await process_tag_batch({
      operation,
      resolved_tags,
      include_path_patterns: argv['include-path-patterns'],
      exclude_path_patterns: argv['exclude-path-patterns'],
      dry_run: argv['dry-run']
    })

    if (argv.json) {
      console.log(JSON.stringify(result, null, 2))
    } else if (!result.success) {
      console.error(
        `Error: ${result.error || 'Some files could not be processed'}`
      )
      exit_code = 1
    } else if (result.updated_count > 0) {
      console.log(`Updated ${result.updated_count} files`)
    } else {
      console.log('No files needed processing')
    }
  } catch (error) {
    console.error(`Error: ${error.message}`)
    exit_code = 1
  }
  flush_and_exit(exit_code)
}
