#!/usr/bin/env node
import path from 'path'
import fs from 'fs/promises'
import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { v4 as uuid } from 'uuid'

import config from '#config'
import { isMain } from '#libs-server'
import { write_entity_to_filesystem } from '#libs-server/entity/filesystem/write-entity-to-filesystem.mjs'
import { get_user_base_directory as get_user_base_from_registry } from '#libs-server/base-uri/base-directory-registry.mjs'

const log = debug('migrate-users-to-entities')

/**
 * Get the user base directory
 * Uses registry if available, falls back to config
 */
function get_user_base_dir() {
  try {
    return get_user_base_from_registry()
  } catch {
    // Fall back to config if registry not set
    const user_base_dir =
      config.user_base_directory || process.env.USER_BASE_DIRECTORY
    if (!user_base_dir) {
      throw new Error('USER_BASE_DIRECTORY not configured')
    }
    return user_base_dir
  }
}

/**
 * Load users.json file
 */
async function load_users_json() {
  const user_base_dir = get_user_base_dir()
  const users_path = path.join(user_base_dir, 'users.json')

  try {
    const content = await fs.readFile(users_path, 'utf8')
    const data = JSON.parse(content)
    return data.users || {}
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error('users.json not found')
    }
    throw error
  }
}

/**
 * Backup users.json file
 */
async function backup_users_json() {
  const user_base_dir = get_user_base_dir()
  const users_path = path.join(user_base_dir, 'users.json')
  const backup_path = path.join(user_base_dir, 'users.json.backup')

  try {
    await fs.copyFile(users_path, backup_path)
    log(`Backed up users.json to ${backup_path}`)
    return backup_path
  } catch (error) {
    throw new Error(`Failed to backup users.json: ${error.message}`)
  }
}

/**
 * Ensure directories exist
 */
async function ensure_directories() {
  const user_base_dir = get_user_base_dir()
  const identity_dir = path.join(user_base_dir, 'identity')
  const role_dir = path.join(user_base_dir, 'role')

  await fs.mkdir(identity_dir, { recursive: true })
  await fs.mkdir(role_dir, { recursive: true })

  log(`Created directories: ${identity_dir}, ${role_dir}`)
  return { identity_dir, role_dir }
}

/**
 * Extract admin role from admin users
 * Admin users have a single rule with action 'allow' and pattern matching all paths
 */
function is_admin_user(user) {
  const rules = user?.permissions?.rules
  if (!rules || rules.length !== 1) {
    return false
  }
  const rule = rules[0]
  return rule.action === 'allow' && rule.pattern === '**/*'
}

/**
 * Create admin role entity
 */
async function create_admin_role({ role_dir, dry_run }) {
  const role_path = path.join(role_dir, 'admin.md')
  const now = new Date().toISOString()

  const entity_properties = {
    title: 'Admin',
    type: 'role',
    description: 'Full access role for admin users',
    base_uri: 'user:role/admin.md',
    entity_id: uuid(),
    created_at: now,
    updated_at: now,
    user_public_key:
      '0000000000000000000000000000000000000000000000000000000000000000',
    rules: [
      {
        action: 'allow',
        pattern: '**/*'
      }
    ]
  }

  const content = `# Admin Role

This role grants full access to all resources in the system.

## Permissions

- Full read access to all resources
- Full write access to all resources (when combined with global_write)
`

  if (dry_run) {
    console.log(`[DRY RUN] Would create admin role at ${role_path}`)
    return entity_properties
  }

  await write_entity_to_filesystem({
    absolute_path: role_path,
    entity_properties,
    entity_type: 'role',
    entity_content: content
  })

  log(`Created admin role at ${role_path}`)
  return entity_properties
}

/**
 * Create public-reader role from public user rules
 */
async function create_public_reader_role({ users, role_dir, dry_run }) {
  const public_user = users.public
  if (!public_user) {
    log('No public user found, skipping public-reader role creation')
    return null
  }

  const rules = public_user?.permissions?.rules || []
  if (rules.length === 0) {
    log('Public user has no rules, skipping public-reader role creation')
    return null
  }

  const role_path = path.join(role_dir, 'public-reader.md')
  const now = new Date().toISOString()

  const entity_properties = {
    title: 'Public Reader',
    type: 'role',
    description: 'Base read permissions for public content',
    base_uri: 'user:role/public-reader.md',
    entity_id: uuid(),
    created_at: now,
    updated_at: now,
    user_public_key:
      '0000000000000000000000000000000000000000000000000000000000000000',
    rules
  }

  const content = `# Public Reader Role

This role defines the base read permissions for public/unauthenticated access.

## Permissions

Rules extracted from the public user in users.json.
`

  if (dry_run) {
    console.log(`[DRY RUN] Would create public-reader role at ${role_path}`)
    console.log(`  - ${rules.length} rules extracted from public user`)
    return entity_properties
  }

  await write_entity_to_filesystem({
    absolute_path: role_path,
    entity_properties,
    entity_type: 'role',
    entity_content: content
  })

  log(`Created public-reader role at ${role_path} with ${rules.length} rules`)
  return entity_properties
}

/**
 * Create identity entity from user
 */
async function create_identity_entity({
  public_key,
  user,
  identity_dir,
  is_admin,
  dry_run
}) {
  // The 'public' pseudo-user keeps its name as the public identity
  const username = public_key === 'public' ? 'public' : user.username
  const filename = `${username}.md`
  const identity_path = path.join(identity_dir, filename)
  const now = new Date().toISOString()

  // Build relations array
  const relations = []
  if (is_admin) {
    relations.push('has_role [[user:role/admin.md]]')
  }
  // Public user gets the public-reader role
  if (public_key === 'public') {
    relations.push('has_role [[user:role/public-reader.md]]')
  }

  // Extract permissions
  const permissions = {}
  if (user?.permissions?.create_threads !== undefined) {
    permissions.create_threads = user.permissions.create_threads
  }
  if (user?.permissions?.global_write !== undefined) {
    permissions.global_write = user.permissions.global_write
  }

  // For non-admin users, keep user-specific rules (not covered by roles)
  // For admin users, rules are handled by the admin role
  const rules = is_admin ? [] : user?.permissions?.rules || []

  const entity_properties = {
    title: username,
    type: 'identity',
    description: `Identity entity for ${username}`,
    base_uri: `user:identity/${filename}`,
    entity_id: uuid(),
    created_at: user.created_at || now,
    updated_at: now,
    user_public_key:
      '0000000000000000000000000000000000000000000000000000000000000000',
    auth_public_key: public_key,
    username,
    permissions: Object.keys(permissions).length > 0 ? permissions : undefined,
    rules: rules.length > 0 ? rules : undefined,
    relations: relations.length > 0 ? relations : undefined
  }

  // Remove undefined properties
  Object.keys(entity_properties).forEach((key) => {
    if (entity_properties[key] === undefined) {
      delete entity_properties[key]
    }
  })

  const content = `# ${username}

Identity entity migrated from users.json.
`

  if (dry_run) {
    console.log(`[DRY RUN] Would create identity at ${identity_path}`)
    console.log(`  - Username: ${username}`)
    console.log(`  - Admin: ${is_admin}`)
    console.log(`  - Rules: ${rules.length}`)
    return entity_properties
  }

  await write_entity_to_filesystem({
    absolute_path: identity_path,
    entity_properties,
    entity_type: 'identity',
    entity_content: content
  })

  log(`Created identity at ${identity_path}`)
  return entity_properties
}

/**
 * Run the migration
 */
async function run_migration({ dry_run = false }) {
  console.log('Starting migration from users.json to entity-based storage...')
  if (dry_run) {
    console.log('[DRY RUN MODE - No files will be created or modified]')
  }

  // Load existing users
  const users = await load_users_json()
  const user_count = Object.keys(users).length
  console.log(`Found ${user_count} users in users.json`)

  if (user_count === 0) {
    console.log('No users to migrate')
    return { success: true, migrated: 0 }
  }

  // Ensure directories exist
  const { identity_dir, role_dir } = await ensure_directories()

  // Backup users.json
  if (!dry_run) {
    await backup_users_json()
  }

  // Create admin role
  await create_admin_role({ role_dir, dry_run })

  // Create public-reader role from public user
  await create_public_reader_role({ users, role_dir, dry_run })

  // Create identity entities
  const created_identities = []
  for (const [public_key, user] of Object.entries(users)) {
    const is_admin = is_admin_user(user)
    const identity = await create_identity_entity({
      public_key,
      user,
      identity_dir,
      is_admin,
      dry_run
    })
    created_identities.push(identity)
  }

  console.log('')
  console.log('Migration summary:')
  console.log(`  - Created admin role`)
  console.log(`  - Created public-reader role`)
  console.log(`  - Created ${created_identities.length} identity entities`)

  if (!dry_run) {
    console.log('')
    console.log('Migration completed successfully!')
    console.log('Original users.json has been backed up to users.json.backup')
    console.log('')
    console.log('Next steps:')
    console.log(
      '1. Review the created entities in identity/ and role/ directories'
    )
    console.log(
      '2. Test the permission system with the new entity-based loading'
    )
    console.log('3. Once verified, you can remove users.json (keep backup)')
  }

  return {
    success: true,
    migrated: created_identities.length,
    identities: created_identities
  }
}

const initialize_cli = () => {
  return yargs(hideBin(process.argv))
    .option('dry-run', {
      alias: 'd',
      description: 'Preview migration without making changes',
      type: 'boolean',
      default: false
    })
    .help()
    .alias('help', 'h').argv
}

const main = async () => {
  try {
    const argv = initialize_cli()
    debug.enable('migrate-users-to-entities')
    await run_migration({ dry_run: argv['dry-run'] })
  } catch (err) {
    console.error('Migration failed:', err.message)
    process.exit(1)
  }

  process.exit(0)
}

export { run_migration }
export default run_migration

if (isMain(import.meta.url)) {
  main()
}
