/**
 * Identity subcommand group
 *
 * Manage identity entities (user accounts)
 */

import {
  load_all_identities,
  load_identity_by_username
} from '#libs-server/users/identity-loader.mjs'
import { resolve_user_rules } from '#libs-server/users/permission-resolver.mjs'
import { flush_and_exit } from './lib/format.mjs'

export const command = 'identity <command>'
export const describe = 'Identity operations (list, get)'

export const builder = (yargs) =>
  yargs
    .command(
      'list',
      'List all identity entities',
      (yargs) =>
        yargs.option('with-rules', {
          describe: 'Include resolved rules in output',
          type: 'boolean',
          default: false
        }),
      handle_list
    )
    .command(
      'get <username>',
      'Show identity details',
      (yargs) =>
        yargs
          .positional('username', {
            describe: 'Username to look up',
            type: 'string'
          })
          .option('with-rules', {
            describe: 'Include resolved rules in output',
            type: 'boolean',
            default: true
          }),
      handle_get
    )
    .demandCommand(1, 'Specify a subcommand: list or get')

export const handler = () => {}

async function handle_list(argv) {
  let exit_code = 0
  try {
    const identities = await load_all_identities()

    if (!identities || identities.length === 0) {
      if (argv.json) {
        console.log('[]')
      } else {
        console.log('No identities found')
      }
    } else if (argv.json) {
      const output = argv['with-rules']
        ? await Promise.all(
            identities.map(async (identity) => ({
              ...identity,
              resolved_rules: await resolve_user_rules({ identity })
            }))
          )
        : identities
      console.log(JSON.stringify(output, null, 2))
    } else {
      console.log(`Found ${identities.length} identities:\n`)
      for (const identity of identities) {
        const roles = get_role_names(identity)
        const role_str = roles.length > 0 ? ` (${roles.join(', ')})` : ''
        console.log(`  ${identity.username}${role_str}`)
        if (argv.verbose) {
          console.log(`    Public Key: ${identity.auth_public_key || 'N/A'}`)
          console.log(`    Base URI: ${identity.base_uri}`)
          if (identity.permissions) {
            console.log(`    Permissions: ${JSON.stringify(identity.permissions)}`)
          }
          console.log('')
        }
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
    const identity = await load_identity_by_username({ username: argv.username })

    if (!identity) {
      console.error(`Identity not found: ${argv.username}`)
      flush_and_exit(1)
      return
    }

    if (argv.json) {
      const output = argv['with-rules']
        ? {
            ...identity,
            resolved_rules: await resolve_user_rules({ identity })
          }
        : identity
      console.log(JSON.stringify(output, null, 2))
    } else {
      console.log(`Identity: ${identity.username}`)
      console.log(`  Base URI: ${identity.base_uri}`)
      console.log(`  Public Key: ${identity.auth_public_key || 'N/A'}`)
      console.log(`  Created: ${identity.created_at}`)

      if (identity.permissions) {
        console.log(`  Permissions:`)
        if (identity.permissions.create_threads !== undefined) {
          console.log(`    - create_threads: ${identity.permissions.create_threads}`)
        }
        if (identity.permissions.global_write !== undefined) {
          console.log(`    - global_write: ${identity.permissions.global_write}`)
        }
      }

      const roles = get_role_names(identity)
      if (roles.length > 0) {
        console.log(`  Roles:`)
        for (const role of roles) {
          console.log(`    - ${role}`)
        }
      }

      if (argv['with-rules']) {
        const rules = await resolve_user_rules({ identity })
        console.log(`  Resolved Rules (${rules.length}):`)
        for (const rule of rules) {
          const source = rule.source_uri ? ` [${rule.source}]` : ''
          const reason = rule.reason ? ` (${rule.reason})` : ''
          console.log(`    - ${rule.action}: ${rule.pattern}${reason}${source}`)
        }
      }
    }
  } catch (error) {
    console.error(`Error: ${error.message}`)
    exit_code = 1
  }
  flush_and_exit(exit_code)
}

/**
 * Extract role names from identity relations
 */
function get_role_names(identity) {
  if (!identity?.relations || !Array.isArray(identity.relations)) {
    return []
  }

  const role_names = []
  for (const relation_str of identity.relations) {
    const match = relation_str.match(/^has_role\s+\[\[(.*?)\]\]/)
    if (match) {
      // Extract just the role name from the path
      const role_path = match[1]
      const role_name = role_path.split('/').pop().replace('.md', '')
      role_names.push(role_name)
    }
  }
  return role_names
}
