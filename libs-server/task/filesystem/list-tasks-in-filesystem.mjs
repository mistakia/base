import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { list_entity_files_from_filesystem } from '#libs-server/repository/filesystem/list-entity-files-from-filesystem.mjs'
import is_main from '#libs-server/utils/is-main.mjs'
import {
  add_directory_cli_options,
  handle_cli_directory_registration
} from '#libs-server/base-uri/index.mjs'

const log = debug('task:list-tasks-in-filesystem')
debug.enable('task:list-tasks-in-filesystem')

/**
 * List tasks from the filesystem with optional filtering
 *
 * @param {Object} params - Parameters
 * @param {Array<string>} [params.include_status] - Include tasks with these statuses
 * @param {Array<string>} [params.exclude_status] - Exclude tasks with these statuses
 * @param {Array<string>} [params.include_priority] - Include tasks with these priorities
 * @param {Array<string>} [params.exclude_priority] - Exclude tasks with these priorities
 * @returns {Promise<Array>} - Array of matching tasks
 */
export async function list_tasks_in_filesystem({
  include_status = [],
  exclude_status = [],
  include_priority = [],
  exclude_priority = []
} = {}) {
  try {
    log('Listing tasks from filesystem')

    // First get all task entities
    const task_entities = await list_entity_files_from_filesystem({
      include_entity_types: ['task']
    })

    log(`Found ${task_entities.length} total tasks`)

    // Filter tasks based on status and priority if specified
    const filtered_tasks = task_entities.filter((task) => {
      const task_props = task.entity_properties

      // Check status filters
      if (
        include_status.length > 0 &&
        !include_status.includes(task_props.status)
      ) {
        return false
      }
      if (exclude_status.includes(task_props.status)) {
        return false
      }

      // Check priority filters
      if (
        include_priority.length > 0 &&
        !include_priority.includes(task_props.priority)
      ) {
        return false
      }
      if (exclude_priority.includes(task_props.priority)) {
        return false
      }

      return true
    })

    log(`Found ${filtered_tasks.length} matching tasks after filtering`)
    return filtered_tasks
  } catch (error) {
    log(`Error listing tasks: ${error.message}`)
    throw error
  }
}

if (is_main(import.meta.url)) {
  const argv = add_directory_cli_options(yargs(hideBin(process.argv)))
    .option('include_status', {
      alias: 'is',
      description: 'Include tasks with these statuses (comma-separated)',
      type: 'string',
      coerce: (arg) => (arg ? arg.split(',') : [])
    })
    .option('exclude_status', {
      alias: 'es',
      description: 'Exclude tasks with these statuses (comma-separated)',
      type: 'string',
      coerce: (arg) => (arg ? arg.split(',') : [])
    })
    .option('include_priority', {
      alias: 'ip',
      description: 'Include tasks with these priorities (comma-separated)',
      type: 'string',
      coerce: (arg) => (arg ? arg.split(',') : [])
    })
    .option('exclude_priority', {
      alias: 'ep',
      description: 'Exclude tasks with these priorities (comma-separated)',
      type: 'string',
      coerce: (arg) => (arg ? arg.split(',') : [])
    })
    .help().argv

  const main = async () => {
    // Handle directory registration using the reusable function
    handle_cli_directory_registration(argv)

    let error
    try {
      const tasks = await list_tasks_in_filesystem({
        include_status: argv.include_status,
        exclude_status: argv.exclude_status,
        include_priority: argv.include_priority,
        exclude_priority: argv.exclude_priority
      })

      console.log(JSON.stringify(tasks, null, 2))

      // Print summary of task properties
      const statuses = [
        ...new Set(tasks.map((t) => t.entity_properties.status))
      ]
      const priorities = [
        ...new Set(tasks.map((t) => t.entity_properties.priority))
      ]
      console.log('\nTask Summary:')
      console.log(`Found ${tasks.length} matching tasks`)
      console.log(`Statuses: ${statuses.join(', ')}`)
      console.log(`Priorities: ${priorities.join(', ')}`)
    } catch (err) {
      error = err
      console.error('Error:', error.message)
    }
    process.exit(error ? 1 : 0)
  }

  main()
}
