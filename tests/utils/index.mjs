import jwt from 'jsonwebtoken'
import config from '#config'

export { default as create_test_user } from './create_test_user.mjs'
export { default as reset_all_tables } from './reset_all_tables.mjs'
export { default as create_temp_test_directory } from './create_temp_test_directory.mjs'
export { default as create_temp_test_repo } from './create_temp_test_repo.mjs'
export { default as create_test_thread } from './create_test_thread.mjs'

// Create a JWT authentication token for test purposes
export const create_auth_token = (user) => {
  if (!user || !user.user_id) {
    throw new Error('User object with user_id is required')
  }

  // Generate a JWT token for the test user
  return jwt.sign({ user_id: user.user_id }, config.jwt.secret)
}

// Helper to set up authentication headers for test requests
export const authenticate_request = (request, user) => {
  const token = create_auth_token(user)
  return request.set('Authorization', `Bearer ${token}`)
}
