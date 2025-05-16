import fs from 'fs'
import path from 'path'
import { write_task_to_database } from '#libs-server/entity/database/write/write-task-to-database.mjs'
import { get_base_file_info } from '#libs-server/base-files/get-base-file-info.mjs'
import { write_task_to_filesystem } from '#libs-server/task/filesystem/write-task-to-filesystem.mjs'
import create_temp_test_repo from './create-temp-test-repo.mjs'
import db from '#db'

/**
 * Creates a task entity for testing. This function creates both:
 *
 * 1. Database task: Stored in the entities table with type='task' and have a UUID entity_id.
 *    These tasks are referenced in the tasks table via the entity_id column (UUID).
 *
 * 2. Filesystem task: Stored as markdown files in the filesystem with a path based on base_relative_path.
 *    The base_relative_path is a string in the format "system/task-name" or "user/task-name".
 *
 * @param {Object} options - Test options
 * @param {string} options.user_id - User ID
 * @param {string} [options.title='Test Task'] - Task title
 * @param {string} [options.description='A task for testing'] - Task description
 * @param {string} [options.status='No status'] - Task status
 * @param {string} [options.priority='None'] - Task priority
 * @param {Date} [options.finish_by] - Task deadline
 * @param {string} [options.base_relative_path] - Task base_relative_path in format [system|user]/<task-title>
 * @param {Object} [options.root_base_repo] - Root base repository object with path and user_path
 * @returns {Promise<Object>} Object containing task_entity_id, base_relative_path, root_base_repo, and cleanup function
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
  base_relative_path,
  root_base_repo,
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

  // Generate base_relative_path if not provided
  if (!base_relative_path) {
    base_relative_path = `user/${title.replace(/\s+/g, '-')}`
  }

  // Create temporary repo if not provided
  let temp_repo
  if (!root_base_repo) {
    temp_repo = await create_temp_test_repo({ prefix: 'task-test-' })
    root_base_repo = temp_repo
  }

  // Get file info using the base_relative_path
  const { absolute_path } = await get_base_file_info({
    base_relative_path,
    root_base_directory: root_base_repo.path
  })

  // Make sure the directory exists
  const dir_path = path.dirname(absolute_path)
  fs.mkdirSync(dir_path, { recursive: true })

  // Write task to filesystem
  await write_task_to_filesystem({
    base_relative_path,
    task_properties,
    root_base_directory: root_base_repo.path
  })

  // Write task to database
  const task_entity_id = await write_task_to_database({
    task_properties,
    user_id,
    file_info: {
      base_relative_path
    }
  })

  // Get the base_relative_path from the database to ensure consistency
  const task_data = await db('entities')
    .select('base_relative_path')
    .where('entity_id', task_entity_id)
    .first()

  const cleanup = () => {
    if (temp_repo) {
      temp_repo.cleanup()
    }
  }

  return {
    task_entity_id,
    base_relative_path: task_data.base_relative_path,
    root_base_repo,
    cleanup
  }
}
