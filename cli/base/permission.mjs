/**
 * Permission subcommand group
 *
 * Test and debug permission rules
 */

import { load_identity_by_username } from '#libs-server/users/identity-loader.mjs'
import {
  resolve_user_rules,
  resolve_user_tag_rules
} from '#libs-server/users/permission-resolver.mjs'
import {
  evaluate_permission_rules,
  evaluate_tag_rules
} from '#libs-server/permission/rule-engine.mjs'
import { load_resource_metadata } from '#server/middleware/permission/resource-metadata.mjs'
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
    const path_result = await evaluate_permission_rules({
      rules,
      resource_path: argv.resource,
      user_public_key: identity.auth_public_key
    })

    // If no path rule matched, try tag rules
    let result = path_result
    let match_type = 'path'

    if (path_result.matching_rule === null) {
      const tag_rules = await resolve_user_tag_rules({ identity })
      const resource_metadata = await load_resource_metadata({
        resource_path: argv.resource
      })

      const tag_result = evaluate_tag_rules({
        tag_rules,
        resource_path: argv.resource,
        resource_tags: resource_metadata?.tags
      })

      if (tag_result !== null) {
        result = tag_result
        match_type = 'tag'
      }
    }

    if (argv.json) {
      console.log(
        JSON.stringify(
          {
            username: argv.username,
            resource: argv.resource,
            allowed: result.allowed,
            reason: result.reason,
            match_type,
            matching_rule: result.matching_rule
          },
          null,
          2
        )
      )
    } else {
      const status = result.allowed ? 'ALLOWED' : 'DENIED'
      console.log(
        `Permission Check (user path + tag rules only, excludes public_read and public rules):`
      )
      console.log(`  User: ${argv.username}`)
      console.log(`  Resource: ${argv.resource}`)
      console.log(`  Result: ${status}`)
      console.log(`  Reason: ${result.reason}`)

      if (result.matching_rule) {
        console.log(`  Matching Rule (${match_type}):`)
        console.log(`    - Action: ${result.matching_rule.action}`)
        if (result.matching_rule.pattern) {
          console.log(`    - Pattern: ${result.matching_rule.pattern}`)
        }
        if (result.matching_rule.tag) {
          console.log(`    - Tag: ${result.matching_rule.tag}`)
        }
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
