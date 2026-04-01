/**
 * Review subcommand
 *
 * Wraps review-content.mjs for content review via the unified base CLI.
 * Delegates to the standalone script, passing through all flags.
 */

import { spawn } from 'child_process'
import path from 'path'
import config from '#config'

const REVIEW_SCRIPT = path.join(
  config.system_base_directory,
  'cli',
  'review-content.mjs'
)

export const command = 'review <path>'
export const describe = 'Review content for sensitive information'

export const builder = (yargs) =>
  yargs
    .positional('path', {
      describe: 'File or directory to review',
      type: 'string'
    })
    .option('apply', {
      describe: 'Apply visibility classifications to entities',
      type: 'boolean',
      default: false
    })
    .option('dry-run', {
      describe: 'Preview changes without modifying files',
      type: 'boolean',
      default: false
    })
    .option('regex-only', {
      describe: 'Skip LLM analysis, use regex patterns only',
      type: 'boolean',
      default: false
    })
    .option('model', {
      alias: 'm',
      describe: 'Ollama model for LLM analysis',
      type: 'string'
    })
    .option('propose-rules', {
      describe: 'Output proposed role permission rule additions',
      type: 'boolean',
      default: false
    })
    .option('output', {
      alias: 'o',
      describe: 'Write JSONL streaming output to file (supports resume)',
      type: 'string'
    })
    .option('force', {
      describe: 'Re-scan files that already have visibility_analyzed_at',
      type: 'boolean',
      default: false
    })
    .option('progress', {
      describe: 'Show progress during scanning',
      type: 'boolean',
      default: process.stdout.isTTY || false
    })
    .example('$0 review task/', 'Scan all tasks')
    .example('$0 review task/ --apply --dry-run', 'Preview visibility changes')
    .example('$0 review task/ --apply', 'Scan + apply visibility')
    .example('$0 review task/ --regex-only', 'Regex-only scan')

export const handler = async (argv) => {
  const args = ['--path', argv.path]

  if (argv.apply) args.push('--apply-visibility')
  if (argv.dryRun) args.push('--dry-run')
  if (argv.regexOnly) args.push('--regex-only')
  if (argv.model) args.push('--model', argv.model)
  if (argv.proposeRules) args.push('--propose-rules')
  if (argv.output) args.push('--output', argv.output)
  if (argv.force) args.push('--force')
  if (argv.progress) args.push('--progress')
  if (argv.json) args.push('--json')

  const child = spawn(process.argv[0], [REVIEW_SCRIPT, ...args], {
    stdio: 'inherit',
    env: process.env
  })

  child.on('error', (err) => {
    console.error(`Failed to start review: ${err.message}`)
    process.exit(1)
  })

  child.on('close', (code) => {
    process.exit(code || 0)
  })
}
