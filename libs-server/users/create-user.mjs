import ed25519 from '@trashman/ed25519-blake2b'

import db from '#db'

/**
 * Creates a new user with a public/private key pair
 * @param {Object} user_data - Optional user data to override defaults
 * @param {string} user_data.username - Username (required)
 * @param {string} [user_data.email] - Email address
 * @param {Buffer} [user_data.private_key] - Optional private key (generated if not provided)
 * @returns {Object} User information including private_key and user database record
 * @throws {Error} If username is not provided
 */
export default async function create_user({
  username,
  email = 'user@example.com',
  private_key
} = {}) {
  if (!username) {
    throw new Error('Username is required')
  }

  if (!private_key) {
    throw new Error('Private key is required')
  }

  if (!(private_key instanceof Buffer)) {
    private_key = Buffer.from(private_key, 'hex')
  }

  const public_key = ed25519.publicKey(private_key)
  const data = {
    public_key: public_key.toString('hex'),
    username,
    email
  }

  const [{ user_id }] = await db('users').insert(data).returning('user_id')
  const user = await db('users').where('user_id', user_id).first()

  return {
    private_key,
    ...user
  }
}
