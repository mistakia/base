/**
 * Role subcommand group
 *
 * Manage role entities (permission rule sets)
 */

import { load_all_roles, load_role } from '#libs-server/users/role-loader.mjs'
import { flush_and_exit } from './lib/format.mjs'

export const command = 'role <command>'
export const describe = 'Role operations (list, get)'

export const builder = (yargs) =>
  yargs
    .command('list', 'List all role entities', (yargs) => yargs, handle_list)
    .command(
      'get <name>',
      'Show role details',
      (yargs) =>
        yargs.positional('name', {
          describe: 'Role name or base_uri',
          type: 'string'
        }),
      handle_get
    )
    .demandCommand(1, 'Specify a subcommand: list or get')

export const handler = () => {}

async function handle_list(argv) {
  let exit_code = 0
  try {
    const roles = await load_all_roles()

    if (!roles || roles.length === 0) {
      if (argv.json) {
        console.log('[]')
      } else {
        console.log('No roles found')
      }
    } else if (argv.json) {
      console.log(JSON.stringify(roles, null, 2))
    } else {
      console.log(`Found ${roles.length} roles:\n`)
      for (const role of roles) {
        const rule_count = role.rules?.length || 0
        console.log(`  ${role.title} (${rule_count} rules)`)
        if (argv.verbose) {
          console.log(`    Base URI: ${role.base_uri}`)
          console.log(`    Description: ${role.description || 'N/A'}`)
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
    // Support both role name and full base_uri
    let base_uri = argv.name
    if (!base_uri.includes(':')) {
      // Assume it's a role name, construct base_uri
      base_uri = `user:role/${argv.name}.md`
    }

    const role = await load_role({ base_uri })

    if (!role) {
      console.error(`Role not found: ${argv.name}`)
      flush_and_exit(1)
      return
    }

    if (argv.json) {
      console.log(JSON.stringify(role, null, 2))
    } else {
      console.log(`Role: ${role.title}`)
      console.log(`  Base URI: ${role.base_uri}`)
      console.log(`  Description: ${role.description || 'N/A'}`)
      console.log(`  Created: ${role.created_at}`)

      const rules = role.rules || []
      console.log(`  Rules (${rules.length}):`)
      for (const rule of rules) {
        const reason = rule.reason ? ` (${rule.reason})` : ''
        console.log(`    - ${rule.action}: ${rule.pattern}${reason}`)
      }
    }
  } catch (error) {
    console.error(`Error: ${error.message}`)
    exit_code = 1
  }
  flush_and_exit(exit_code)
}
