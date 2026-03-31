/**
 * Queue subcommand
 *
 * Wraps CLI command queue operations for background execution.
 */

import { flush_and_exit } from './lib/format.mjs'

async function get_queue() {
  const mod = await import('#server/services/cli-queue/queue.mjs')
  const available = await mod.test_redis_connection()
  if (!available) {
    await mod.close_cli_queue()
    throw new Error(
      `Redis unavailable. Queue operations require a running Redis server. ` +
        `Configure redis_url in config or set REDIS_URL env var.`
    )
  }
  return mod
}

export const command = 'queue <command>'
export const describe = 'Command queue operations'

export const builder = (yargs) =>
  yargs
    .command(
      'add <cmd>',
      'Queue a command for background execution',
      (yargs) =>
        yargs
          .positional('cmd', {
            describe: 'Command string to queue',
            type: 'string'
          })
          .option('tags', {
            alias: 't',
            describe: 'Comma-separated tags for concurrency control',
            type: 'string'
          })
          .option('priority', {
            alias: 'p',
            describe: 'Job priority (lower = higher priority)',
            type: 'number',
            default: 10
          })
          .option('cwd', {
            alias: 'c',
            describe: 'Working directory for command execution',
            type: 'string'
          })
          .option('timeout', {
            describe: 'Command timeout in milliseconds',
            type: 'number'
          }),
      handle_add
    )
    .command(
      'status <job_id>',
      'Check job status',
      (yargs) =>
        yargs.positional('job_id', {
          describe: 'Job ID to check',
          type: 'string'
        }),
      handle_status
    )
    .command('stats', 'View queue statistics', {}, handle_stats)
    .demandCommand(1, 'Specify a subcommand: add, status, or stats')

export const handler = () => {}

async function handle_add(argv) {
  let exit_code = 0
  let queue_mod = null
  try {
    queue_mod = await get_queue()
    const job_options = {
      command: argv.cmd,
      tags: argv.tags ? argv.tags.split(',').map((t) => t.trim()) : [],
      priority: argv.priority,
      working_directory: argv.cwd || process.cwd()
    }

    if (argv.timeout) {
      job_options.timeout_ms = argv.timeout
    }

    const result = await queue_mod.add_cli_job(job_options)

    if (argv.json) {
      console.log(JSON.stringify(result, null, 2))
    } else {
      console.log(`${result.id}\tqueued`)
    }
  } catch (error) {
    console.error(`Error: ${error.message}`)
    exit_code = 1
  } finally {
    if (queue_mod) await queue_mod.close_cli_queue()
  }
  flush_and_exit(exit_code)
}

async function handle_status(argv) {
  let exit_code = 0
  let queue_mod = null
  try {
    queue_mod = await get_queue()
    const status = await queue_mod.get_job_status(argv.job_id)

    if (!status) {
      console.log(`Job ${argv.job_id} not found`)
      exit_code = 1
    } else if (argv.json) {
      console.log(JSON.stringify(status, null, 2))
    } else {
      const parts = [status.id, status.state]
      if (status.return_value) {
        parts.push(
          status.return_value.success ? 'success' : 'failed',
          `${status.return_value.duration_ms}ms`
        )
      }
      console.log(parts.join('\t'))
    }
  } catch (error) {
    console.error(`Error: ${error.message}`)
    exit_code = 1
  } finally {
    if (queue_mod) await queue_mod.close_cli_queue()
  }
  flush_and_exit(exit_code)
}

async function handle_stats(argv) {
  let exit_code = 0
  let queue_mod = null
  try {
    queue_mod = await get_queue()
    const stats = await queue_mod.get_queue_stats()

    if (argv.json) {
      console.log(JSON.stringify(stats, null, 2))
    } else {
      console.log(
        `waiting: ${stats.waiting}\tactive: ${stats.active}\tcompleted: ${stats.completed}\tfailed: ${stats.failed}`
      )
    }
  } catch (error) {
    console.error(`Error: ${error.message}`)
    exit_code = 1
  } finally {
    if (queue_mod) await queue_mod.close_cli_queue()
  }
  flush_and_exit(exit_code)
}
