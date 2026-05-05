/**
 * Identity subcommand group
 *
 * Manage identity entities (user accounts)
 */

import fs from 'fs/promises'
import crypto from 'crypto'
import path from 'path'

import {
  load_all_identities,
  load_identity_by_username,
  clear_identity_cache
} from '#libs-server/users/identity-loader.mjs'
import { parse_relation_entry } from '#libs-server/entity/format/extractors/relation-extractor.mjs'
import { resolve_user_rules } from '#libs-server/users/permission-resolver.mjs'
import create_user from '#libs-server/users/create-user.mjs'
import ed25519 from '#libs-server/crypto/ed25519-blake2b.mjs'
import { get_user_base_directory } from '#libs-server/base-uri/base-directory-registry.mjs'
import { flush_and_exit } from './lib/format.mjs'

export const command = 'identity <command>'
export const describe = 'Identity operations (list, get, create)'

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
    .command(
      'create',
      'Create a new identity with Blake2b Ed25519 key pair',
      (yargs) =>
        yargs
          .option('username', {
            describe: 'Username for the new identity',
            type: 'string',
            demandOption: true
          })
          .option('role', {
            describe:
              'Role name (e.g., "acquaintance", maps to user:role/<name>.md)',
            type: 'string'
          })
          .option('rules', {
            describe: 'JSON array of permission rules',
            type: 'string'
          })
          .option('dry-run', {
            describe: 'Preview without writing',
            type: 'boolean',
            default: false
          }),
      handle_create
    )
    .command(
      'create-keypair',
      'Generate Ed25519 keypair and attach auth_public_key to an existing identity',
      (yargs) =>
        yargs
          .option('for', {
            describe: 'Username of the existing identity to retrofit',
            type: 'string',
            demandOption: true
          })
          .option('dry-run', {
            describe: 'Preview without writing',
            type: 'boolean',
            default: false
          }),
      handle_create_keypair
    )
    .demandCommand(1, 'Specify a subcommand: list, get, create, or create-keypair')

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
            console.log(
              `    Permissions: ${JSON.stringify(identity.permissions)}`
            )
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
    const identity = await load_identity_by_username({
      username: argv.username
    })

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
          console.log(
            `    - create_threads: ${identity.permissions.create_threads}`
          )
        }
        if (identity.permissions.global_write !== undefined) {
          console.log(
            `    - global_write: ${identity.permissions.global_write}`
          )
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

async function handle_create(argv) {
  let exit_code = 0
  try {
    // Check for duplicate username
    const existing = await load_identity_by_username({
      username: argv.username
    })
    if (existing) {
      console.error(
        `Error: Identity already exists for username: ${argv.username}`
      )
      flush_and_exit(1)
      return
    }

    // Build relations from --role
    const relations = []
    if (argv.role) {
      const role_uri = `user:role/${argv.role}.md`
      const user_base_dir = get_user_base_directory()
      const role_path = path.join(user_base_dir, 'role', `${argv.role}.md`)
      try {
        await fs.access(role_path)
      } catch {
        console.error(`Error: Role file not found: ${role_path}`)
        flush_and_exit(1)
        return
      }
      relations.push(`has_role [[${role_uri}]]`)
    }

    // Parse --rules JSON
    let rules
    if (argv.rules) {
      try {
        rules = JSON.parse(argv.rules)
        if (!Array.isArray(rules)) {
          throw new Error('Rules must be a JSON array')
        }
      } catch (error) {
        console.error(`Error: Invalid --rules JSON: ${error.message}`)
        flush_and_exit(1)
        return
      }
    }

    // Generate private key
    const user_private_key = crypto.randomBytes(32)

    if (argv['dry-run']) {
      console.log('Dry run - would create identity:')
      console.log(`  Username: ${argv.username}`)
      if (argv.role) {
        console.log(`  Role: ${argv.role}`)
      }
      if (rules) {
        console.log(`  Rules: ${JSON.stringify(rules)}`)
      }
      console.log(`  File: identity/${argv.username}.md`)
      flush_and_exit(0)
      return
    }

    const result = await create_user({
      username: argv.username,
      user_private_key,
      relations,
      ...(rules ? { rules } : {})
    })

    const file_path = `identity/${argv.username}.md`

    if (argv.json) {
      console.log(
        JSON.stringify(
          {
            username: result.username,
            public_key: result.user_public_key,
            private_key: user_private_key.toString('hex'),
            role: argv.role || null,
            file: file_path
          },
          null,
          2
        )
      )
    } else {
      console.log(`Identity created:`)
      console.log(`  Username:    ${result.username}`)
      console.log(`  Public Key:  ${result.user_public_key}`)
      console.log(`  Private Key: ${user_private_key.toString('hex')}`)
      if (argv.role) {
        console.log(`  Role:        ${argv.role}`)
      }
      console.log(`  File:        ${file_path}`)
    }
  } catch (error) {
    console.error(`Error: ${error.message}`)
    exit_code = 1
  }
  flush_and_exit(exit_code)
}

async function handle_create_keypair(argv) {
  let exit_code = 0
  try {
    const username = argv.for
    const identity = await load_identity_by_username({ username })
    if (!identity) {
      console.error(`Identity not found: ${username}`)
      flush_and_exit(1)
      return
    }
    if (identity.auth_public_key) {
      console.error(
        `Identity ${username} already has auth_public_key. Refusing to overwrite.`
      )
      flush_and_exit(1)
      return
    }

    const user_private_key = crypto.randomBytes(32)
    const user_public_key = ed25519.publicKey(user_private_key).toString('hex')

    if (argv['dry-run']) {
      console.log(`Dry run - would write auth_public_key to identity/${username}.md`)
      console.log(`  Public Key:  ${user_public_key}`)
      flush_and_exit(0)
      return
    }

    const user_base_dir = get_user_base_directory()
    const file_path = path.join(user_base_dir, 'identity', `${username}.md`)
    const original = await fs.readFile(file_path, 'utf8')

    const fm_match = original.match(/^---\n([\s\S]*?)\n---\n/)
    if (!fm_match) {
      console.error(`Could not parse frontmatter in ${file_path}`)
      flush_and_exit(1)
      return
    }
    const fm_body = fm_match[1]
    const after_fm = original.slice(fm_match[0].length)
    const updated_at = new Date().toISOString()

    let new_fm = fm_body
    if (/^auth_public_key:/m.test(new_fm)) {
      new_fm = new_fm.replace(
        /^auth_public_key:.*$/m,
        `auth_public_key: ${user_public_key}`
      )
    } else {
      new_fm = `auth_public_key: ${user_public_key}\n${new_fm}`
    }
    if (/^updated_at:/m.test(new_fm)) {
      new_fm = new_fm.replace(/^updated_at:.*$/m, `updated_at: '${updated_at}'`)
    } else {
      new_fm = `${new_fm}\nupdated_at: '${updated_at}'`
    }

    await fs.writeFile(file_path, `---\n${new_fm}\n---\n${after_fm}`)
    clear_identity_cache()

    if (argv.json) {
      console.log(
        JSON.stringify(
          {
            username,
            public_key: user_public_key,
            private_key: user_private_key.toString('hex'),
            file: `identity/${username}.md`
          },
          null,
          2
        )
      )
    } else {
      console.log(`Keypair issued for ${username}:`)
      console.log(`  Public Key:  ${user_public_key}`)
      console.log(`  Private Key: ${user_private_key.toString('hex')}`)
      console.log(`  File:        identity/${username}.md`)
      console.log('')
      console.log(
        'Private key is shown ONCE. Server retains only the public key.'
      )
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
  for (const relation_entry of identity.relations) {
    const parsed = parse_relation_entry(relation_entry)
    if (parsed && parsed.relation_type === 'has_role') {
      const role_name = parsed.base_uri.split('/').pop().replace('.md', '')
      role_names.push(role_name)
    }
  }
  return role_names
}
