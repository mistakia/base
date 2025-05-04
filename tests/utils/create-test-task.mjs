import { write_task_to_database } from '#libs-server/entity/database/write/write-task-to-database.mjs'

/**
 * Creates a task entity for testing with read operations
 *
 * @param {Object} options - Test options
 * @param {string} options.user_id - User ID
 * @param {string} [options.title='Test Task'] - Task title
 * @param {string} [options.description='Test description'] - Task description
 * @param {Object} [options.additional_properties={}] - Additional properties
 * @param {string} [options.task_content='# Test Task\n\nContent body'] - Task content
 * @returns {Promise<string>} Task entity ID
 */
export default async function create_test_task({
  user_id,
  title = 'Test Task',
  description = 'Test description',
  additional_properties = {},
  task_content = '# Test Task\n\nContent body'
}) {
  const task_properties = {
    title,
    description,
    status: 'No status',
    priority: 'Medium',
    ...additional_properties
  }

  return write_task_to_database({
    task_properties,
    user_id,
    task_content
  })
}
