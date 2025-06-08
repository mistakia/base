import fs from 'fs'
import path from 'path'
import { write_task_to_database } from '#libs-server/entity/database/write/write-task-to-database.mjs'
import { resolve_base_uri } from '#libs-server/base-uri/index.mjs'
import { write_task_to_filesystem } from '#libs-server/task/filesystem/write-task-to-filesystem.mjs'
import { setup_test_directories } from './setup-test-directories.mjs'
import db from '#db'

/**
 * Creates a task entity for testing. This function creates both:
 *
 * 1. Database task: Stored in the entities table with type='task' and have a UUID entity_id.
 *    These tasks are referenced in the tasks table via the entity_id column (UUID).
 *
 * 2. Filesystem task: Stored as markdown files in the filesystem with a path based on base_uri.
 *    The base_uri is a string in the format "sys:task/task-name.md" or "user:task/task-name.md".
 *
 * @param {Object} options - Test options
 * @param {string} options.user_id - User ID
 * @param {string} [options.title='Test Task'] - Task title
 * @param {string} [options.description='A task for testing'] - Task description
 * @param {string} [options.status='No status'] - Task status
 * @param {string} [options.priority='None'] - Task priority
 * @param {Date} [options.finish_by] - Task deadline
 * @param {string} [options.base_uri] - Task base_uri in format sys:task/<task-title>.md or user:task/<task-title>.md
 * @param {Object} [options.test_directories] - Test directories object with system and user paths
 * @returns {Promise<Object>} Object containing task_entity_id, base_uri, test_directories, and cleanup function
 */
export default async function create_test_task({
  user_id,
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
  if (!user_id) {
    throw new Error('user_id is required')
  }

  const task_properties = {
    user_id,
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

  // Write task to filesystem
  await write_task_to_filesystem({
    base_uri,
    task_properties
  })

  // Write task to database
  const task_entity_id = await write_task_to_database({
    task_properties,
    user_id,
    absolute_path: absolute_path || '/dummy/path.md',
    base_uri,
    git_sha: 'dummysha1'
  })

  // Get the base_uri from the database to ensure consistency
  const task_data = await db('entities')
    .select('base_uri')
    .where('entity_id', task_entity_id)
    .first()

  const cleanup = () => {
    if (temp_directories) {
      temp_directories.cleanup()
    }
  }

  return {
    task_entity_id,
    base_uri: task_data.base_uri,
    test_directories,
    cleanup
  }
}
