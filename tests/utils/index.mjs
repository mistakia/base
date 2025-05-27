import jwt from 'jsonwebtoken'
import config from '#config'
import create_test_user from './create-test-user.mjs'
import create_temp_test_directory from './create-temp-test-directory.mjs'
import create_temp_test_repo from './create-temp-test-repo.mjs'
import reset_all_tables from './reset-all-tables.mjs'
import create_test_thread from './create-test-thread.mjs'
import create_test_task from './create-test-task.mjs'
import create_test_tag from './create-test-tag.mjs'

export {
  create_test_user,
  create_temp_test_directory,
  create_temp_test_repo,
  reset_all_tables,
  create_test_thread,
  create_test_task,
  create_test_tag
}

export default {
  create_test_user,
  create_temp_test_directory,
  create_temp_test_repo,
  reset_all_tables,
  create_test_thread,
  create_test_task,
  create_test_tag
}

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
