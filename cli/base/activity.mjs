/**
 * Activity subcommand group
 *
 * View activity metrics for entities based on thread activity.
 */

import embedded_index_manager from '#libs-server/embedded-database-index/embedded-index-manager.mjs'
import { query_entities_by_thread_activity } from '#libs-server/embedded-database-index/sqlite/sqlite-activity-queries.mjs'
import {
  parse_time_period_date,
  is_valid_time_period
} from '#libs-server/utils/parse-time-period.mjs'
import { format_entity, flush_and_exit } from './lib/format.mjs'
import { query, api_mutate } from './lib/data-access.mjs'

export const command = 'activity <command>'
export const describe = 'Activity metrics (entities)'

export const builder = (yargs) =>
  yargs
    .command(
      'entities',
      'List entities ranked by recent thread activity',
      (yargs) =>
        yargs
          .option('period', {
            alias: 'p',
            describe: 'Time period (e.g., 24h, 7d, 2w, 1m)',
            type: 'string',
            default: '7d'
          })
          .option('type', {
            alias: 't',
            describe: 'Entity type filter',
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
      handle_entities
    )
    .command(
      'rebuild-heatmap',
      'Rebuild the activity heatmap from scratch',
      () => {},
      handle_rebuild_heatmap
    )
    .demandCommand(1, 'Specify a subcommand: entities, rebuild-heatmap')

export const handler = () => {}

/**
 * Format relative time from a date
 */
function format_relative_time(date) {
  if (!date) return ''

  const now = new Date()
  const then = new Date(date)
  const diff_ms = now - then
  const diff_seconds = Math.floor(diff_ms / 1000)
  const diff_minutes = Math.floor(diff_seconds / 60)
  const diff_hours = Math.floor(diff_minutes / 60)
  const diff_days = Math.floor(diff_hours / 24)

  if (diff_days > 0) {
    return `${diff_days}d ago`
  } else if (diff_hours > 0) {
    return `${diff_hours}h ago`
  } else if (diff_minutes > 0) {
    return `${diff_minutes}m ago`
  } else {
    return 'just now'
  }
}

async function handle_rebuild_heatmap() {
  let exit_code = 0
  try {
    console.log('Rebuilding activity heatmap...')
    await query(
      async () => {
        await api_mutate('/api/activity/rebuild-heatmap', 'POST', {})
      },
      async () => {
        console.log('API unavailable, using direct DuckDB access')
        const { rebuild_activity_heatmap } = await import(
          '#server/services/cache-warmer.mjs'
        )
        await embedded_index_manager.initialize()
        try {
          await rebuild_activity_heatmap()
        } finally {
          await embedded_index_manager.shutdown()
        }
      }
    )
    console.log('Activity heatmap rebuild complete')
  } catch (error) {
    console.error(`Error: ${error.message}`)
    exit_code = 1
  }
  flush_and_exit(exit_code)
}

async function handle_entities(argv) {
  let exit_code = 0
  try {
    const period = argv.period
    if (!is_valid_time_period(period)) {
      throw new Error(
        `Invalid period format: ${period}. Use format like 24h, 7d, 2w, 1m`
      )
    }

    const since_date = parse_time_period_date(period)
    await embedded_index_manager.initialize()

    const entities = await query_entities_by_thread_activity({
      since_date,
      entity_types: argv.type || null,
      limit: argv.limit,
      offset: argv.offset
    })

    if (!entities || entities.length === 0) {
      if (argv.json) {
        console.log('[]')
      } else {
        console.log('No entities with thread activity found')
      }
    } else if (argv.json) {
      console.log(JSON.stringify(entities, null, 2))
    } else if (argv.verbose) {
      for (let i = 0; i < entities.length; i++) {
        const entity = entities[i]
        console.log(format_entity(entity, { verbose: true }))
        console.log(`  threads: ${entity.thread_count}`)
        console.log(
          `  last_activity: ${format_relative_time(entity.last_activity)}`
        )
        if (i < entities.length - 1) {
          console.log('')
        }
      }
    } else {
      // Default: compact tab-separated output
      // base_uri  threads  last_activity  title
      for (const entity of entities) {
        const parts = [
          entity.base_uri,
          String(entity.thread_count),
          format_relative_time(entity.last_activity),
          entity.title || ''
        ]
        console.log(parts.join('\t'))
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
