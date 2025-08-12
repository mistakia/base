import fs from 'fs'
import path from 'path'
import { resolve_base_uri } from '#libs-server/base-uri/index.mjs'
import { write_task_to_filesystem } from '#libs-server/task/filesystem/write-task-to-filesystem.mjs'
import { setup_test_directories } from './setup-test-directories.mjs'

/**
 * Creates a task entity for testing using file-first architecture.
 *
 * Note: This function now only creates filesystem tasks as part of the PostgreSQL removal.
 * Database operations have been removed in favor of pure file-based storage.
 *
 * @param {Object} options - Test options
 * @param {string} options.user_public_key - User public key
 * @param {string} [options.title='Test Task'] - Task title
 * @param {string} [options.description='A task for testing'] - Task description
 * @param {string} [options.status='No status'] - Task status
 * @param {string} [options.priority='None'] - Task priority
 * @param {Date} [options.finish_by] - Task deadline
 * @param {string} [options.base_uri] - Task base_uri in format sys:task/<task-title>.md or user:task/<task-title>.md
 * @param {Object} [options.test_directories] - Test directories object with system and user paths
 * @returns {Promise<Object>} Object containing base_uri, test_directories, and cleanup function
 */
export default async function create_test_task({
  user_public_key,
  title = 'Test Task',
  description = 'A task for testing',
  status = 'No status',
  priority = 'None',
  finish_by,
  created_at = new Date(),
  updated_at = new Date(),
  base_uri,
  test_directories,
  ...other_task_properties
}) {
  if (!user_public_key) {
    throw new Error('user_public_key is required')
  }

  const task_properties = {
    user_public_key,
    title,
    description,
    status,
    priority,
    finish_by,
    created_at,
    updated_at,
    ...other_task_properties
  }

  // Generate base_uri if not provided
  if (!base_uri) {
    const task_filename = `${title.replace(/\s+/g, '-').toLowerCase()}.md`
    base_uri = `user:task/${task_filename}`
  }

  // Setup test directories if not provided
  let temp_directories
  if (!test_directories) {
    temp_directories = setup_test_directories({
      system_prefix: 'task-system-',
      user_prefix: 'task-user-'
    })
    test_directories = temp_directories
  }

  // Resolve absolute path from base URI
  const absolute_path = resolve_base_uri(base_uri)

  // Make sure the directory exists
  const dir_path = path.dirname(absolute_path)
  fs.mkdirSync(dir_path, { recursive: true })

  // Write task to filesystem (file-first architecture)
  await write_task_to_filesystem({
    base_uri,
    task_properties
  })

  const cleanup = () => {
    if (temp_directories) {
      temp_directories.cleanup()
    }
  }

  return {
    base_uri,
    test_directories,
    cleanup
  }
}
