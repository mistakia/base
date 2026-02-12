import fs from 'fs/promises'
import path from 'path'
import { randomUUID } from 'crypto'

import ed25519 from '@trashman/ed25519-blake2b'
import config from '#config'
import { get_user_base_directory } from '#libs-server/base-uri/base-directory-registry.mjs'
import { clear_identity_cache } from '#libs-server/users/identity-loader.mjs'

/**
 * Creates a new user by writing an identity entity file
 * @param {Object} user_data - User data
 * @param {string} user_data.username - Username (required)
 * @param {string} [user_data.email] - Email address
 * @param {Buffer} [user_data.user_private_key] - Private key (required)
 * @param {Array} [user_data.rules] - Permission rules
 * @param {Object} [user_data.permissions] - Capability flags (create_threads, global_write)
 * @returns {Object} User information including user_private_key
 * @throws {Error} If username or private key is not provided
 */
export default async function create_user({
  username,
  email = 'user@example.com',
  user_private_key,
  rules = [
    { action: 'allow', pattern: 'user:**' },
    { action: 'allow', pattern: 'sys:**' }
  ],
  permissions = {}
} = {}) {
  if (!username) {
    throw new Error('Username is required')
  }

  if (!user_private_key) {
    throw new Error('Private key is required')
  }

  if (!(user_private_key instanceof Buffer)) {
    user_private_key = Buffer.from(user_private_key, 'hex')
  }

  const user_public_key = ed25519.publicKey(user_private_key)
  const public_key_hex = user_public_key.toString('hex')
  const now = new Date().toISOString()

  let user_base_dir
  try {
    user_base_dir = get_user_base_directory()
  } catch {
    user_base_dir = config.user_base_directory
  }
  if (!user_base_dir) {
    throw new Error('USER_BASE_DIRECTORY not configured')
  }

  const identity_dir = path.join(user_base_dir, 'identity')
  await fs.mkdir(identity_dir, { recursive: true })

  // Build frontmatter
  const frontmatter = {
    title: username,
    type: 'identity',
    description: `Identity entity for ${username}`,
    auth_public_key: public_key_hex,
    base_uri: `user:identity/${username}.md`,
    created_at: now,
    entity_id: randomUUID(),
    username
  }

  if (rules && rules.length > 0) {
    frontmatter.rules = rules
  }

  if (permissions && Object.keys(permissions).length > 0) {
    frontmatter.permissions = permissions
  }

  frontmatter.updated_at = now

  // Build YAML manually to match entity format
  const yaml_lines = ['---']
  yaml_lines.push(`title: ${username}`)
  yaml_lines.push('type: identity')
  yaml_lines.push(`description: Identity entity for ${username}`)
  yaml_lines.push(`auth_public_key: ${public_key_hex}`)
  yaml_lines.push(`base_uri: user:identity/${username}.md`)
  yaml_lines.push(`created_at: '${now}'`)
  yaml_lines.push(`entity_id: ${frontmatter.entity_id}`)
  yaml_lines.push(`username: ${username}`)

  if (rules && rules.length > 0) {
    yaml_lines.push('rules:')
    for (const rule of rules) {
      yaml_lines.push(`  - action: ${rule.action}`)
      yaml_lines.push(`    pattern: '${rule.pattern}'`)
      if (rule.reason) {
        yaml_lines.push(`    reason: ${rule.reason}`)
      }
    }
  }

  if (permissions && Object.keys(permissions).length > 0) {
    yaml_lines.push('permissions:')
    for (const [key, value] of Object.entries(permissions)) {
      yaml_lines.push(`  ${key}: ${value}`)
    }
  }

  yaml_lines.push(`updated_at: '${now}'`)
  yaml_lines.push('---')
  yaml_lines.push('')
  yaml_lines.push(`# ${username}`)
  yaml_lines.push('')

  const file_content = yaml_lines.join('\n')
  const file_path = path.join(identity_dir, `${username}.md`)
  await fs.writeFile(file_path, file_content)

  // Clear identity cache so the new entity is picked up
  clear_identity_cache()

  return {
    user_private_key,
    user_public_key: public_key_hex,
    username,
    created_at: now
  }
}
