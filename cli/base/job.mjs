/**
 * Job subcommand
 *
 * Query and monitor tracked job executions.
 */

import { flush_and_exit } from './lib/format.mjs'

export const command = 'job <command>'
export const describe = 'Job tracker operations'

export const builder = (yargs) =>
  yargs
    .command('list', 'List all tracked jobs', {}, handle_list)
    .command(
      'get <job_id>',
      'Get details for a specific job',
      (yargs) =>
        yargs.positional('job_id', {
          describe: 'Job identifier',
          type: 'string'
        }),
      handle_get
    )
    .command(
      'check-missed',
      'Check for missed job executions',
      {},
      handle_check_missed
    )
    .demandCommand(1, 'Specify a subcommand: list, get, check-missed')

export const handler = () => {}

async function handle_list(argv) {
  let exit_code = 0
  try {
    const { load_all_jobs } = await import(
      '#libs-server/jobs/report-job.mjs'
    )
    const jobs = await load_all_jobs()

    if (argv.json) {
      console.log(JSON.stringify(jobs, null, 2))
      flush_and_exit(exit_code)
      return
    }

    if (jobs.length === 0) {
      console.log('No tracked jobs found')
      flush_and_exit(exit_code)
      return
    }

    const sorted = [...jobs].sort((a, b) =>
      (a.job_id || '').localeCompare(b.job_id || '')
    )

    if (argv.verbose) {
      for (const job of sorted) {
        const status = job.last_execution?.success ? '[OK]' : '[FAIL]'
        console.log(`${status} ${job.job_id}`)
        console.log(`  Name: ${job.name}`)
        console.log(`  Source: ${job.source}`)
        console.log(`  Total runs: ${job.stats.total_runs}`)
        console.log(`  Failures: ${job.stats.failure_count}`)
        if (job.last_execution) {
          console.log(`  Last run: ${job.last_execution.timestamp}`)
          console.log(`  Duration: ${job.last_execution.duration_ms}ms`)
        }
        if (job.schedule) {
          console.log(`  Schedule: ${job.schedule} (${job.schedule_type})`)
        }
        console.log('')
      }
    } else {
      for (const job of sorted) {
        const last_success = job.stats.last_success || '-'
        const last_run = job.last_execution?.timestamp || '-'
        console.log(
          `${job.job_id}\t${job.source}\t${last_success}\t${last_run}\t${job.stats.total_runs}\t${job.stats.failure_count}`
        )
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
    const { load_job } = await import('#libs-server/jobs/report-job.mjs')
    const job = await load_job({ job_id: argv.job_id })

    if (!job) {
      console.error(`Job not found: ${argv.job_id}`)
      flush_and_exit(1)
      return
    }

    if (argv.json) {
      console.log(JSON.stringify(job, null, 2))
    } else {
      console.log(`Job: ${job.job_id}`)
      console.log(`Name: ${job.name}`)
      console.log(`Source: ${job.source}`)
      console.log(`Project: ${job.project || '-'}`)
      console.log(`Server: ${job.server || '-'}`)
      console.log(`Schedule: ${job.schedule || '-'} (${job.schedule_type || '-'})`)
      console.log(`Total runs: ${job.stats.total_runs}`)
      console.log(`Successes: ${job.stats.success_count}`)
      console.log(`Failures: ${job.stats.failure_count}`)
      console.log(`Last success: ${job.stats.last_success || '-'}`)
      console.log(`Last failure: ${job.stats.last_failure || '-'}`)
      if (job.last_execution) {
        console.log(`Last run: ${job.last_execution.timestamp}`)
        console.log(`Last result: ${job.last_execution.success ? 'success' : 'failure'}`)
        console.log(`Last duration: ${job.last_execution.duration_ms}ms`)
      }
      if (argv.verbose && job.failure_history.length > 0) {
        console.log(`\nRecent failures:`)
        for (const entry of job.failure_history.slice(-10)) {
          console.log(`  ${entry.timestamp}\t${entry.reason || '-'}`)
        }
      }
    }
  } catch (error) {
    console.error(`Error: ${error.message}`)
    exit_code = 1
  }
  flush_and_exit(exit_code)
}

async function handle_check_missed(argv) {
  let exit_code = 0
  try {
    const { check_missed_jobs } = await import(
      '#libs-server/jobs/check-missed-jobs.mjs'
    )
    const missed = await check_missed_jobs()

    if (argv.json) {
      console.log(JSON.stringify(missed, null, 2))
      flush_and_exit(exit_code)
      return
    }

    if (missed.length === 0) {
      console.log('No missed job executions detected')
    } else {
      console.log(`Found ${missed.length} missed execution(s):`)
      for (const entry of missed) {
        console.log(
          `  ${entry.job_id}\texpected: ${entry.expected_run}\tlast: ${entry.last_run || 'never'}`
        )
      }
    }
  } catch (error) {
    console.error(`Error: ${error.message}`)
    exit_code = 1
  }
  flush_and_exit(exit_code)
}
