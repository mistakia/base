/**
 * Stats subcommand group
 *
 * Collect, report, and list system stats snapshots.
 */

import path from 'path'

import config from '#config'
import embedded_index_manager from '#libs-server/embedded-database-index/embedded-index-manager.mjs'
import {
  get_stats_database_connection,
  close_stats_pool,
  query_latest_snapshot,
  list_snapshot_dates
} from '#libs-server/stats/database.mjs'
import { run_stats_snapshot } from '#libs-server/stats/snapshot.mjs'
import {
  discover_extensions,
  get_extension_paths
} from '#libs-server/extension/discover-extensions.mjs'
import { flush_and_exit } from './lib/format.mjs'

export const command = 'stats <command>'
export const describe = 'System stats snapshots'

export const builder = (yargs) =>
  yargs
    .command(
      'snapshot',
      'Run collectors and store a stats snapshot',
      (yargs) =>
        yargs
          .option('date', {
            describe: 'Snapshot date (YYYY-MM-DD), defaults to today',
            type: 'string'
          })
          .option('dry-run', {
            describe: 'Preview metrics without storing',
            type: 'boolean',
            default: false
          })
          .option('collectors', {
            alias: 'c',
            describe: 'Comma-separated list of collectors to run',
            type: 'string'
          }),
      handle_snapshot
    )
    .command(
      'report',
      'Display latest snapshot as a report',
      (yargs) =>
        yargs
          .option('date', {
            describe: 'Snapshot date (YYYY-MM-DD)',
            type: 'string'
          })
          .option('category', {
            describe: 'Filter by category',
            type: 'string'
          }),
      handle_report
    )
    .command('list', 'List available snapshot dates', () => {}, handle_list)
    .demandCommand(1, 'You must specify a subcommand')

async function load_extension_collectors() {
  const additional = {}
  try {
    const extensions = discover_extensions(get_extension_paths(config))
    for (const ext of extensions) {
      if (!ext.provided_capabilities.includes('stats-collector')) continue
      const provider_path = path.join(
        ext.extension_path,
        'provide',
        'stats-collector.mjs'
      )
      const mod = await import(provider_path)
      if (mod.collectors) {
        Object.assign(additional, mod.collectors)
      }
    }
  } catch (err) {
    // Extension collectors are optional
    const log = (await import('debug')).default('stats:extension')
    log('Failed to load extension collectors: %s', err.message)
  }
  return additional
}

async function handle_snapshot(argv) {
  try {
    // Initialize DuckDB for collectors that need it
    if (!embedded_index_manager.initialized) {
      await embedded_index_manager.initialize({ read_only: true })
    }

    const pool = await get_stats_database_connection({ config })
    const collector_list = argv.collectors
      ? argv.collectors.split(',').map((s) => s.trim())
      : undefined

    const additional_collectors = await load_extension_collectors()

    const { summary, metrics } = await run_stats_snapshot({
      snapshot_date: argv.date,
      config,
      pool,
      collectors: collector_list,
      additional_collectors,
      dry_run: argv['dry-run']
    })

    if (argv.json) {
      console.log(
        JSON.stringify(
          argv['dry-run'] ? { summary, metrics } : summary,
          null,
          2
        )
      )
    } else {
      console.log(`Snapshot: ${summary.snapshot_date}`)
      console.log(`Total metrics: ${summary.total_metrics}`)
      if (summary.dry_run) console.log('(dry run -- not stored)')
      console.log('')

      for (const [name, info] of Object.entries(summary.collectors)) {
        console.log(`  ${name}: ${info.count} metrics (${info.duration_ms}ms)`)
      }

      if (summary.errors.length > 0) {
        console.log(`\nErrors (${summary.errors.length}):`)
        for (const err of summary.errors) {
          console.log(`  ${err}`)
        }
      }
    }

    await close_stats_pool()
    flush_and_exit(0)
  } catch (error) {
    console.error('Error:', error.message)
    await close_stats_pool()
    flush_and_exit(1)
  }
}

async function handle_report(argv) {
  try {
    const pool = await get_stats_database_connection({ config })

    let rows
    if (argv.date) {
      const result = await pool.query(
        `SELECT snapshot_date, category, metric_name, metric_value, unit, dimensions
         FROM metrics WHERE snapshot_date = $1 ORDER BY category, metric_name`,
        [argv.date]
      )
      rows = result.rows
    } else {
      rows = await query_latest_snapshot({ pool })
    }

    if (argv.category) {
      rows = rows.filter((r) => r.category === argv.category)
    }

    if (argv.json) {
      // Group by category for structured output
      const grouped = {}
      for (const row of rows) {
        if (!grouped[row.category]) grouped[row.category] = []
        grouped[row.category].push(row)
      }
      console.log(JSON.stringify(grouped, null, 2))
    } else if (rows.length === 0) {
      console.log('No snapshot data found.')
    } else {
      const date_display = format_date(rows[0].snapshot_date)
      console.log(`Snapshot: ${date_display}\n`)
      let current_category = null
      for (const row of rows) {
        if (row.category !== current_category) {
          if (current_category) console.log('')
          current_category = row.category
          console.log(`[${current_category}]`)
        }
        const dims =
          Object.keys(row.dimensions || {}).length > 0
            ? ` (${Object.entries(row.dimensions)
                .map(([k, v]) => `${k}=${v}`)
                .join(', ')})`
            : ''
        console.log(
          `  ${row.metric_name}: ${row.metric_value} ${row.unit || ''}${dims}`
        )
      }
    }

    await close_stats_pool()
    flush_and_exit(0)
  } catch (error) {
    console.error('Error:', error.message)
    await close_stats_pool()
    flush_and_exit(1)
  }
}

async function handle_list(argv) {
  try {
    const pool = await get_stats_database_connection({ config })
    const dates = await list_snapshot_dates({ pool })

    if (argv.json) {
      console.log(JSON.stringify(dates, null, 2))
    } else if (dates.length === 0) {
      console.log('No snapshots found. Run: base stats snapshot')
    } else {
      console.log('Available snapshots:\n')
      for (const row of dates) {
        console.log(
          `  ${format_date(row.snapshot_date)}  (${row.metric_count} metrics)`
        )
      }
    }

    await close_stats_pool()
    flush_and_exit(0)
  } catch (error) {
    console.error('Error:', error.message)
    await close_stats_pool()
    flush_and_exit(1)
  }
}

function format_date(d) {
  if (d instanceof Date) return d.toISOString().split('T')[0]
  return String(d)
}

export default {
  command,
  describe,
  builder
}
