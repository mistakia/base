#!/usr/bin/env bun

/**
 * Unified Base CLI
 *
 * Single entry point wrapping entity, relation, tag, thread, search, and queue
 * operations into composable subcommands optimized for agent use.
 *
 * Usage:
 *   base <command> <subcommand> [options]
 *
 * Examples:
 *   base entity list -t task --status "In Progress"
 *   base relation list user:task/my-task.md
 *   base tag list
 *   base search "feature request"
 */

import '../polyfills/node25-slow-buffer.cjs'
import path from 'path'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import { isMain } from '#libs-server/is-main.mjs'
import {
  add_directory_cli_options,
  handle_cli_directory_registration
} from '#libs-server/base-uri/index.mjs'
import {
  discover_extensions,
  get_extension_paths
} from '#libs-server/extension/discover-extensions.mjs'
import { load_extension_providers } from '#libs-server/extension/load-extension-providers.mjs'

import * as entity_command from './base/entity.mjs'
import * as relation_command from './base/relation.mjs'
import * as tag_command from './base/tag.mjs'
import * as thread_command from './base/thread.mjs'
import * as search_command from './base/search.mjs'
import * as queue_command from './base/queue.mjs'
import * as activity_command from './base/activity.mjs'
import * as schedule_command from './base/schedule.mjs'
import * as database_command from './base/database.mjs'
import * as identity_command from './base/identity.mjs'
import * as role_command from './base/role.mjs'
import * as permission_command from './base/permission.mjs'
import * as setup_command from './base/setup.mjs'
import * as review_command from './base/review.mjs'
import * as index_command from './base/index.mjs'
import * as machine_command from './base/machine.mjs'
import * as extension_command from './base/extension.mjs'
import * as skill_command from './base/skill.mjs'
import * as workflow_command from './base/workflow.mjs'
import * as job_command from './base/job.mjs'
import * as crontab_command from './base/crontab.mjs'
import * as stats_command from './base/stats.mjs'
import * as update_command from './base/update.mjs'
import * as install_command from './base/install.mjs'
import * as uninstall_command from './base/uninstall.mjs'
import * as outdated_command from './base/outdated.mjs'
import * as init_command from './initial-setup.mjs'

const load_extensions = async (parser) => {
  const config = (await import('#config')).default
  const extension_paths = get_extension_paths(config)
  if (extension_paths.length === 0) return

  const extensions = discover_extensions(extension_paths)

  // Load capability providers before commands
  try {
    await load_extension_providers(extensions)
  } catch (error) {
    console.error(`Warning: Failed to load extension providers: ${error.message}`)
  }

  // Register extension CLI commands
  for (const ext of extensions) {
    if (!ext.has_commands) continue
    try {
      const mod = await import(path.join(ext.extension_path, 'command.mjs'))
      parser.command(mod)
    } catch (error) {
      console.error(
        `Warning: Failed to load extension "${ext.name}": ${error.message}`
      )
    }
  }
}

// Commands that work without a configured user-base directory.
// All other commands require USER_BASE_DIRECTORY to be set.
const DEGRADED_MODE_COMMANDS = new Set([
  'init', 'update', 'install', 'uninstall', 'outdated', 'setup'
])

const main = async () => {
  const parser = add_directory_cli_options(yargs(hideBin(process.argv)))
    .scriptName('base')
    .usage('Unified Base CLI.\n\nUsage: $0 <command> [options]')
    .middleware(async (argv) => {
      handle_cli_directory_registration(argv)

      // In degraded mode (no USER_BASE_DIRECTORY), only allow commands
      // that don't require user data. Other commands get an actionable error.
      const config = (await import('#config')).default
      if (config.degraded && argv._ && argv._[0]) {
        const command = String(argv._[0])
        if (!DEGRADED_MODE_COMMANDS.has(command)) {
          console.error(
            `Error: USER_BASE_DIRECTORY is not set. Run "base init" to create a user-base directory.`
          )
          process.exit(1)
        }
      }
    })
    .command(entity_command)
    .command(relation_command)
    .command(tag_command)
    .command(thread_command)
    .command(search_command)
    .command(queue_command)
    .command(activity_command)
    .command(schedule_command)
    .command(database_command)
    .command(identity_command)
    .command(role_command)
    .command(permission_command)
    .command(setup_command)
    .command(review_command)
    .command(index_command)
    .command(machine_command)
    .command(extension_command)
    .command(skill_command)
    .command(workflow_command)
    .command(job_command)
    .command(crontab_command)
    .command(stats_command)
    .command(update_command)
    .command(install_command)
    .command(uninstall_command)
    .command(outdated_command)
    .command(init_command)

  await load_extensions(parser)

  parser
    .option('json', {
      describe: 'Output as JSON',
      type: 'boolean',
      default: false,
      global: true
    })
    .option('verbose', {
      alias: 'v',
      describe: 'Verbose multi-line output',
      type: 'boolean',
      default: false,
      global: true
    })
    .strict()
    .demandCommand(1, 'You must specify a command')
    .help()
    .alias('help', 'h')
    .wrap(100)

  await parser.parse()
}

// In compiled binaries, isMain() returns false for all modules (they share
// the same import.meta.url). Detect compiled mode via /$bunfs/ prefix.
const is_compiled = import.meta.url.includes('/$bunfs/')
if (is_compiled || isMain(import.meta.url)) {
  main()
}
