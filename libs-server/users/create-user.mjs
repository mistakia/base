import ed25519 from '@trashman/ed25519-blake2b'
import user_registry from './user-registry.mjs'

/**
 * Creates a new user with a public/private key pair
 * @param {Object} user_data - Optional user data to override defaults
 * @param {string} user_data.username - Username (required)
 * @param {string} [user_data.email] - Email address
 * @param {Buffer} [user_data.user_private_key] - Optional private key (generated if not provided)
 * @returns {Object} User information including user_private_key and user database record
 * @throws {Error} If username is not provided
 */
export default async function create_user({
  username,
  email = 'user@example.com',
  user_private_key
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

  const user_data = {
    user_public_key: user_public_key.toString('hex'),
    username,
    email,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }

  // Add user to registry with permissions for accessing resources
  // Users get read access to user and system resources via pattern rules
  // Write access is ownership-based by default (no global_write)
  const users = await user_registry.load_users()
  users[user_public_key.toString('hex')] = {
    username,
    created_at: new Date().toISOString(),
    permissions: {
      rules: [
        { action: 'allow', pattern: 'user:**' },
        { action: 'allow', pattern: 'sys:**' }
      ]
    }
  }
  await user_registry.save_users(users)

  return {
    user_private_key,
    user_public_key: user_public_key.toString('hex'),
    username,
    created_at: user_data.created_at
  }
}
