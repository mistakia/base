/**
 * Crontab subcommand
 *
 * Preprocess crontab source files for deployment, auto-injecting
 * JOB_SCHEDULE from cron timing fields.
 */

import { readFileSync } from 'fs'

import { flush_and_exit } from './lib/format.mjs'

export const command = 'crontab <command>'
export const describe = 'Crontab preprocessing operations'

export const builder = (yargs) =>
  yargs
    .command(
      'build <file>',
      'Preprocess a crontab source file for deployment',
      (yargs) =>
        yargs.positional('file', {
          describe: 'Path to crontab source file',
          type: 'string'
        }),
      handle_build
    )
    .demandCommand(1, 'Specify a subcommand: build')

export const handler = () => {}

// Matches standard 5-field cron timing at start of line.
// Each field can be: *, */N, N, N-M, N,M, N-M/S, or combinations with commas.
const CRON_FIELD = '[0-9*,/\\-]+'
const CRON_TIMING_RE = new RegExp(
  `^(${CRON_FIELD}\\s+${CRON_FIELD}\\s+${CRON_FIELD}\\s+${CRON_FIELD}\\s+${CRON_FIELD})\\s+(.+)$`
)

// Variable assignment line (KEY=value)
const VAR_ASSIGN_RE = /^[A-Z_]+=.*/

// Lines to strip from variable assignments
const STRIP_VAR_RE = /^(JOB_API_URL=|JOB_API_KEY=|JOB_SCHEDULE_TYPE=)/

// Inline JOB_SCHEDULE="..." and JOB_SCHEDULE_TYPE=word to strip from commands
const INLINE_JOB_SCHEDULE_RE = /JOB_SCHEDULE="[^"]*"\s*/g
const INLINE_JOB_SCHEDULE_TYPE_RE = /JOB_SCHEDULE_TYPE=\S+\s*/g

function process_line(line) {
  // Blank lines and comments pass through
  if (line.trim() === '' || line.trim().startsWith('#')) {
    return line
  }

  // Variable assignment lines
  if (VAR_ASSIGN_RE.test(line)) {
    if (STRIP_VAR_RE.test(line)) {
      return null // strip this line
    }
    return line
  }

  // Cron job lines
  const match = line.match(CRON_TIMING_RE)
  if (match) {
    const timing = match[1]
    let command_part = match[2]

    // Strip any existing JOB_SCHEDULE and JOB_SCHEDULE_TYPE from command
    command_part = command_part
      .replace(INLINE_JOB_SCHEDULE_RE, '')
      .replace(INLINE_JOB_SCHEDULE_TYPE_RE, '')
      .trim()

    return `${timing} JOB_SCHEDULE="${timing}" JOB_SCHEDULE_TYPE=expr ${command_part}`
  }

  // Unrecognized lines pass through
  return line
}

async function handle_build(argv) {
  let exit_code = 0
  try {
    const content = readFileSync(argv.file, 'utf-8')
    const lines = content.split('\n')
    const output_lines = [
      '# Built by: base crontab build -- do not edit directly'
    ]

    for (const line of lines) {
      // Skip existing build header (idempotency)
      if (line.startsWith('# Built by: base crontab build')) {
        continue
      }

      const result = process_line(line)
      if (result !== null) {
        output_lines.push(result)
      }
    }

    // Remove trailing empty line if content ended with newline
    const output = output_lines.join('\n')
    process.stdout.write(output)
    if (!output.endsWith('\n')) {
      process.stdout.write('\n')
    }
  } catch (error) {
    console.error(`Error: ${error.message}`)
    exit_code = 1
  }
  flush_and_exit(exit_code)
}
