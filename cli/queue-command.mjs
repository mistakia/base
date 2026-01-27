#!/usr/bin/env node

/**
 * CLI tool to enqueue commands for background execution
 *
 * Usage:
 *   node queue-command.mjs "command to run" --tags tag1,tag2 --priority 5 --cwd /path
 *   node queue-command.mjs status <job-id>
 *   node queue-command.mjs stats
 */

import {
  add_cli_job,
  get_job_status,
  get_queue_stats,
  close_cli_queue
} from '#libs-server/cli-queue/index.mjs'

const parse_args = (args) => {
  const result = {
    command: null,
    subcommand: null,
    job_id: null,
    tags: [],
    priority: 10,
    cwd: process.cwd(),
    timeout: null
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]

    if (arg === 'status' && !result.command) {
      result.subcommand = 'status'
      result.job_id = args[++i]
    } else if (arg === 'stats' && !result.command) {
      result.subcommand = 'stats'
    } else if (arg === '--tags' || arg === '-t') {
      result.tags = args[++i]?.split(',').map((t) => t.trim()) || []
    } else if (arg === '--priority' || arg === '-p') {
      result.priority = parseInt(args[++i], 10) || 10
    } else if (arg === '--cwd' || arg === '-c') {
      result.cwd = args[++i] || process.cwd()
    } else if (arg === '--timeout') {
      result.timeout = parseInt(args[++i], 10) || null
    } else if (arg === '--help' || arg === '-h') {
      result.subcommand = 'help'
    } else if (!arg.startsWith('-') && !result.command && !result.subcommand) {
      result.command = arg
    }
  }

  return result
}

const print_help = () => {
  console.log(`
CLI Command Queue

Usage:
  queue-command "command to run" [options]
  queue-command status <job-id>
  queue-command stats

Options:
  --tags, -t      Comma-separated tags for concurrency control
  --priority, -p  Job priority (lower = higher priority, default: 10)
  --cwd, -c       Working directory for command execution
  --timeout       Command timeout in milliseconds
  --help, -h      Show this help message

Examples:
  queue-command "yarn test" --tags test,ci --priority 5
  queue-command "node script.mjs" --tags claude-session --cwd ~/project
  queue-command status cli-abc123
  queue-command stats
`)
}

const handle_queue = async ({ command, tags, priority, cwd, timeout }) => {
  const job_options = {
    command,
    tags,
    priority,
    working_directory: cwd
  }

  if (timeout) {
    job_options.timeout_ms = timeout
  }

  const result = await add_cli_job(job_options)

  console.log(`Job queued successfully`)
  console.log(`  ID: ${result.id}`)
  if (tags.length > 0) {
    console.log(`  Tags: ${tags.join(', ')}`)
  }
}

const handle_status = async (job_id) => {
  if (!job_id) {
    throw new Error('Job ID required\nUsage: queue-command status <job-id>')
  }

  const status = await get_job_status(job_id)

  if (!status) {
    console.log(`Job ${job_id} not found`)
    return
  }

  console.log(`Job: ${status.id}`)
  console.log(`  State: ${status.state}`)
  console.log(`  Attempts: ${status.attempts_made}`)

  if (status.return_value) {
    console.log(`  Result:`)
    console.log(`    Success: ${status.return_value.success}`)
    console.log(`    Exit code: ${status.return_value.exit_code}`)
    console.log(`    Duration: ${status.return_value.duration_ms}ms`)
  }

  if (status.failed_reason) {
    console.log(`  Failed reason: ${status.failed_reason}`)
  }
}

const handle_stats = async () => {
  const stats = await get_queue_stats()

  console.log(`Queue Statistics`)
  console.log(`  Waiting: ${stats.waiting}`)
  console.log(`  Active: ${stats.active}`)
  console.log(`  Completed: ${stats.completed}`)
  console.log(`  Failed: ${stats.failed}`)
}

const main = async () => {
  const args = process.argv.slice(2)
  const parsed = parse_args(args)

  try {
    if (
      parsed.subcommand === 'help' ||
      (!parsed.command && !parsed.subcommand)
    ) {
      print_help()
      return
    }

    if (parsed.subcommand === 'status') {
      await handle_status(parsed.job_id)
      return
    }

    if (parsed.subcommand === 'stats') {
      await handle_stats()
      return
    }

    await handle_queue(parsed)
  } catch (error) {
    console.error(`Error: ${error.message}`)
    process.exitCode = 1
  } finally {
    await close_cli_queue()
  }
}

main()
