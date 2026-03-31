/**
 * Permission subcommand group
 *
 * Test and debug permission rules
 */

import { load_identity_by_username } from '#libs-server/users/identity-loader.mjs'
import { resolve_user_rules } from '#libs-server/users/permission-resolver.mjs'
import { evaluate_permission_rules } from '#libs-server/permission/rule-engine.mjs'
import { flush_and_exit } from './lib/format.mjs'

export const command = 'permission <command>'
export const describe = 'Permission operations (check)'

export const builder = (yargs) =>
  yargs
    .command(
      'check <username> <resource>',
      'Test permission for user on resource',
      (yargs) =>
        yargs
          .positional('username', {
            describe: 'Username to check permissions for',
            type: 'string'
          })
          .positional('resource', {
            describe: 'Resource path to check (base_uri format)',
            type: 'string'
          }),
      handle_check
    )
    .demandCommand(1, 'Specify a subcommand: check')

export const handler = () => {}

async function handle_check(argv) {
  let exit_code = 0
  try {
    const identity = await load_identity_by_username({
      username: argv.username
    })

    if (!identity) {
      console.error(`Identity not found: ${argv.username}`)
      flush_and_exit(1)
      return
    }

    const rules = await resolve_user_rules({ identity })
    const result = await evaluate_permission_rules({
      rules,
      resource_path: argv.resource,
      user_public_key: identity.auth_public_key
    })

    if (argv.json) {
      console.log(
        JSON.stringify(
          {
            username: argv.username,
            resource: argv.resource,
            allowed: result.allowed,
            reason: result.reason,
            matching_rule: result.matching_rule
          },
          null,
          2
        )
      )
    } else {
      const status = result.allowed ? 'ALLOWED' : 'DENIED'
      console.log(`Permission Check:`)
      console.log(`  User: ${argv.username}`)
      console.log(`  Resource: ${argv.resource}`)
      console.log(`  Result: ${status}`)
      console.log(`  Reason: ${result.reason}`)

      if (result.matching_rule) {
        console.log(`  Matching Rule:`)
        console.log(`    - Action: ${result.matching_rule.action}`)
        console.log(`    - Pattern: ${result.matching_rule.pattern}`)
        if (result.matching_rule.source_uri) {
          console.log(`    - Source: ${result.matching_rule.source_uri}`)
        }
        if (result.matching_rule.reason) {
          console.log(`    - Rule Reason: ${result.matching_rule.reason}`)
        }
      }
    }
  } catch (error) {
    console.error(`Error: ${error.message}`)
    exit_code = 1
  }
  flush_and_exit(exit_code)
}
