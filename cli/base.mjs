#!/usr/bin/env node

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
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import { isMain } from '#libs-server'
import {
  add_directory_cli_options,
  handle_cli_directory_registration
} from '#libs-server/base-uri/index.mjs'

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
import * as init_command from './initial-setup.mjs'

const main = async () => {
  const parser = add_directory_cli_options(yargs(hideBin(process.argv)))
    .scriptName('base')
    .usage('Unified Base CLI.\n\nUsage: $0 <command> [options]')
    .middleware((argv) => {
      handle_cli_directory_registration(argv)
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
    .command(init_command)
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

if (isMain(import.meta.url)) {
  main()
}
