/**
 * Job subcommand
 *
 * Query and monitor tracked job executions.
 */

import {
  flush_and_exit,
  format_job,
  format_relative_time,
  output_results
} from './lib/format.mjs'

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
    const { load_all_jobs } = await import('#libs-server/jobs/report-job.mjs')
    const jobs = await load_all_jobs()

    // Sort: failures first, then by most recent run
    const sorted = [...jobs].sort((a, b) => {
      const a_ok = a.last_execution?.success ?? true
      const b_ok = b.last_execution?.success ?? true
      if (a_ok !== b_ok) return a_ok ? 1 : -1
      const a_ts = a.last_execution?.timestamp || ''
      const b_ts = b.last_execution?.timestamp || ''
      return b_ts.localeCompare(a_ts)
    })

    output_results(sorted, {
      json: argv.json,
      verbose: argv.verbose,
      formatter: format_job,
      empty_message: 'No tracked jobs found'
    })
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
      const status = job.last_execution
        ? job.last_execution.success
          ? 'OK'
          : 'FAIL'
        : 'NEW'
      console.log(`Job: ${job.name || job.job_id} [${status}]`)
      if (job.name && job.name !== job.job_id) {
        console.log(`ID: ${job.job_id}`)
      }
      console.log(`Source: ${job.source}`)
      if (job.project) console.log(`Project: ${job.project}`)
      if (job.server) console.log(`Server: ${job.server}`)
      if (job.schedule) {
        console.log(`Schedule: ${job.schedule} (${job.schedule_type})`)
      }
      console.log(`Total runs: ${job.stats.total_runs}`)
      console.log(`Successes: ${job.stats.success_count}`)
      console.log(`Failures: ${job.stats.failure_count}`)
      if (job.stats.last_success) {
        console.log(
          `Last success: ${format_relative_time(job.stats.last_success)} (${job.stats.last_success})`
        )
      }
      if (job.stats.last_failure) {
        console.log(
          `Last failure: ${format_relative_time(job.stats.last_failure)} (${job.stats.last_failure})`
        )
      }
      if (job.last_execution) {
        console.log(
          `Last run: ${format_relative_time(job.last_execution.timestamp)} (${job.last_execution.timestamp})`
        )
        console.log(
          `Last result: ${job.last_execution.success ? 'success' : 'failure'}`
        )
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
    const { check_missed_jobs } =
      await import('#libs-server/jobs/check-missed-jobs.mjs')
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
