#!/usr/bin/env node

/**
 * CLI Tool Template
 *
 * Replace this header with a description of what your CLI tool does.
 * Include usage examples and feature descriptions.
 *
 * Examples:
 *
 *   # Basic usage
 *   node cli/your-tool.mjs
 *
 *   # With options
 *   node cli/your-tool.mjs --option value
 *
 *   # With directory options for different base paths
 *   node cli/your-tool.mjs --user_base_directory "/path/to/user/base"
 */

import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import { isMain } from '#libs-server'
// import config from '#config'
import {
  add_directory_cli_options,
  handle_cli_directory_registration
} from '#libs-server/base-uri/index.mjs'

// =============================================================================
// CLI CONFIGURATION - Quick Reference for Available Options
// =============================================================================
const cli_config = (argv_parser) =>
  add_directory_cli_options(argv_parser)
    .scriptName('your-tool-name')
    .usage('$0 [options]')
    .option('example_option', {
      type: 'string',
      description: 'Description of your option',
      default: 'default_value'
    })
    .option('boolean_option', {
      type: 'boolean',
      description: 'Description of boolean option',
      default: false
    })
    .option('array_option', {
      type: 'array',
      description: 'Description of array option (e.g., "pattern1,pattern2")',
      default: []
    })
    .example('$0', 'Basic usage example')
    .example('$0 --example_option value', 'Usage with option example')
    .help()
    .alias('help', 'h')

// Configure debugging
// const log = debug('template')
debug.enable('template')

const run = async () => {
  // Your main logic here
}

export default run

const main = async () => {
  const argv = cli_config(yargs(hideBin(process.argv))).argv

  // Handle directory registration (required for base-uri system)
  handle_cli_directory_registration(argv)

  let error
  try {
    await run({
      // Pass CLI arguments to your function
      example_option: argv.example_option,
      boolean_option: argv.boolean_option,
      array_option: argv.array_option
    })
  } catch (err) {
    error = err
    console.error(error)
  }

  // File-first architecture - no database logging needed
  // All operations should use filesystem-based logging if needed

  process.exit(error ? 1 : 0)
}

if (isMain(import.meta.url)) {
  main()
}
