import create_user from '#libs-server/users/create-user.mjs'
import crypto from 'crypto'
/**
 * Creates a test user with random credentials
 * @returns {Object} Test user information
 */
export default async function create_test_user() {
  return create_user({
    username: `test_user_${Math.floor(Math.random() * 10000)}`,
    email: 'test@test.com',
    private_key: crypto.randomBytes(32)
  })
}
