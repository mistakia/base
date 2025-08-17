import debug from 'debug'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import config from '#config'
import is_main from '#libs-server/utils/is-main.mjs'
import {
  add_directory_cli_options,
  handle_cli_directory_registration
} from '#libs-server/base-uri/index.mjs'
import { list_entity_files_from_filesystem } from '#libs-server/repository/filesystem/list-entity-files-from-filesystem.mjs'
import { TASK_STATUS } from '#libs-shared/task-constants.mjs'

const log = debug('task:filesystem:list')

/**
 * List tasks from the filesystem based on provided filters
 * This replaces the database-based task listing with file-based operations
 *
 * @param {Object} params - Query parameters
 * @param {string} params.user_public_key - User public key to filter tasks by
 * @param {string} [params.status] - Task status to filter by
 * @param {Array<string>} [params.tag_entity_ids=[]] - Tag entity IDs to filter by
 * @param {Array<string>} [params.organization_ids=[]] - Organization IDs to filter by
 * @param {Array<string>} [params.person_ids=[]] - Person IDs to filter by
 * @param {string} [params.min_finish_by] - Minimum finish_by date
 * @param {string} [params.max_finish_by] - Maximum finish_by date
 * @param {number} [params.min_estimated_total_duration] - Minimum estimated total duration
 * @param {number} [params.max_estimated_total_duration] - Maximum estimated total duration
 * @param {string} [params.min_planned_start] - Minimum planned start date
 * @param {string} [params.max_planned_start] - Maximum planned start date
 * @param {string} [params.min_planned_finish] - Minimum planned finish date
 * @param {string} [params.max_planned_finish] - Maximum planned finish date
 * @param {boolean} [params.archived=false] - Whether to include archived tasks
 * @returns {Promise<Array>} - List of tasks matching the filters
 */
export async function list_tasks_from_filesystem({
  user_public_key,
  status,
  include_status = [],
  exclude_status = [],
  include_priority = [],
  exclude_priority = [],
  include_completed = false,
  tag_entity_ids = [],
  organization_ids = [],
  person_ids = [],
  min_finish_by,
  max_finish_by,
  min_estimated_total_duration,
  max_estimated_total_duration,
  min_planned_start,
  max_planned_start,
  min_planned_finish,
  max_planned_finish,
  archived = false
}) {
  try {
    log(`Listing tasks from filesystem for user ${user_public_key}`)

    // Use the proper entity listing function that handles entity validation and type filtering
    const task_entities = await list_entity_files_from_filesystem({
      include_entity_types: ['task'],
      include_path_patterns: ['task/**/*.md'] // Focus on task directory
    })

    const matching_tasks = []

    for (const entity_file of task_entities) {
      try {
        const { entity_properties } = entity_file

        // Skip if not belonging to the user
        if (entity_properties.user_public_key !== user_public_key) {
          continue
        }

        // Apply filters
        if (
          !passes_filters(entity_properties, {
            status,
            include_status,
            exclude_status,
            include_priority,
            exclude_priority,
            include_completed,
            tag_entity_ids,
            organization_ids,
            person_ids,
            min_finish_by,
            max_finish_by,
            min_estimated_total_duration,
            max_estimated_total_duration,
            min_planned_start,
            max_planned_start,
            min_planned_finish,
            max_planned_finish,
            archived
          })
        ) {
          continue
        }

        matching_tasks.push(entity_file)
      } catch (error) {
        log('Error processing task entity:', error.message)
      }
    }

    log(`Found ${matching_tasks.length} matching tasks`)
    return matching_tasks
  } catch (error) {
    log('Error listing tasks from filesystem:', error)
    throw error
  }
}

/**
 * Check if a task passes the given filters
 * @param {Object} entity_properties - The task properties
 * @param {Object} filters - The filter criteria
 * @returns {boolean} - True if task passes all filters
 */
function passes_filters(entity_properties, filters) {
  const {
    status,
    include_status = [],
    exclude_status = [],
    include_priority = [],
    exclude_priority = [],
    include_completed = false,
    min_finish_by,
    max_finish_by,
    min_estimated_total_duration,
    max_estimated_total_duration,
    min_planned_start,
    max_planned_start,
    min_planned_finish,
    max_planned_finish,
    archived
  } = filters

  // Status filters
  const task_status = entity_properties.status

  // Single status equality (legacy)
  if (status && task_status !== status) return false

  // include_completed influences exclude_status
  const final_exclude_status = include_completed
    ? exclude_status
    : [...new Set([...(exclude_status || []), TASK_STATUS.COMPLETED])]

  if (
    include_status &&
    include_status.length > 0 &&
    !include_status.includes(task_status)
  ) {
    return false
  }
  if (final_exclude_status && final_exclude_status.includes(task_status)) {
    return false
  }

  // Priority filters
  const task_priority = entity_properties.priority
  if (
    include_priority &&
    include_priority.length > 0 &&
    !include_priority.includes(task_priority)
  ) {
    return false
  }
  if (exclude_priority && exclude_priority.includes(task_priority)) {
    return false
  }

  // Archived filter
  if (!archived && entity_properties.archived === true) {
    return false
  }

  // Date range filters
  if (
    min_finish_by &&
    entity_properties.finish_by &&
    entity_properties.finish_by < min_finish_by
  ) {
    return false
  }
  if (
    max_finish_by &&
    entity_properties.finish_by &&
    entity_properties.finish_by > max_finish_by
  ) {
    return false
  }

  // Duration filters
  if (
    min_estimated_total_duration &&
    entity_properties.estimated_total_duration &&
    entity_properties.estimated_total_duration < min_estimated_total_duration
  ) {
    return false
  }
  if (
    max_estimated_total_duration &&
    entity_properties.estimated_total_duration &&
    entity_properties.estimated_total_duration > max_estimated_total_duration
  ) {
    return false
  }

  // Planned date filters
  if (
    min_planned_start &&
    entity_properties.planned_start &&
    entity_properties.planned_start < min_planned_start
  ) {
    return false
  }
  if (
    max_planned_start &&
    entity_properties.planned_start &&
    entity_properties.planned_start > max_planned_start
  ) {
    return false
  }
  if (
    min_planned_finish &&
    entity_properties.planned_finish &&
    entity_properties.planned_finish < min_planned_finish
  ) {
    return false
  }
  if (
    max_planned_finish &&
    entity_properties.planned_finish &&
    entity_properties.planned_finish > max_planned_finish
  ) {
    return false
  }

  // Note: tag_entity_ids, organization_ids, person_ids filtering would require
  // resolving relations, which is done at a higher level
  // For now, we'll implement basic property-based filtering

  return true
}

/**
 * Extract target base_uris for a specific relation type
 * @param {Array} resolved_relations - Array of resolved relations
 * @param {string} relation_type - The relation type to extract
 * @returns {Array} - Array of target base_uris
 */
// function extract_relation_targets(resolved_relations, relation_type) {
//   return resolved_relations
//     .filter((relation) => relation.relation_type === relation_type)
//     .map((relation) => relation.target_base_uri)
// }

export default {
  list_tasks_from_filesystem
}

// CLI support when run directly
if (is_main(import.meta.url)) {
  debug.enable(
    'task:filesystem:list,repository:filesystem:list-entity-files,markdown:scanner:filesystem'
  )
  const argv = add_directory_cli_options(
    yargs(hideBin(process.argv)).parserConfiguration({
      'comma-separated-values': true,
      'flatten-duplicate-arrays': true
    })
  )
    .default('user_base_directory', config.user_base_directory)
    .scriptName('list-tasks-from-filesystem')
    .usage('List tasks from filesystem with filters.\n\nUsage: $0 [options]')
    .option('user_public_key', {
      alias: 'u',
      describe:
        'User public key to filter tasks by (defaults to config.user_public_key)',
      type: 'string',
      default: config.user_public_key
    })
    .option('status', {
      alias: 's',
      describe: 'Single status to match (legacy exact match)',
      type: 'string'
    })
    .option('include_status', {
      describe: 'Statuses to include',
      type: 'array'
    })
    .option('exclude_status', {
      describe: 'Statuses to exclude',
      type: 'array'
    })
    .option('include_priority', {
      describe: 'Priorities to include',
      type: 'array'
    })
    .option('exclude_priority', {
      describe: 'Priorities to exclude',
      type: 'array'
    })
    .option('include_completed', {
      describe: 'Include completed tasks',
      type: 'boolean',
      default: false
    })
    .option('tag_entity_ids', {
      describe: 'Filter by tag entity ids',
      type: 'array'
    })
    .option('organization_ids', {
      describe: 'Filter by organization ids',
      type: 'array'
    })
    .option('person_ids', {
      describe: 'Filter by person ids',
      type: 'array'
    })
    .option('min_finish_by', {
      describe: 'Minimum finish_by date (ISO string)',
      type: 'string'
    })
    .option('max_finish_by', {
      describe: 'Maximum finish_by date (ISO string)',
      type: 'string'
    })
    .option('min_estimated_total_duration', {
      describe: 'Minimum estimated total duration',
      type: 'number'
    })
    .option('max_estimated_total_duration', {
      describe: 'Maximum estimated total duration',
      type: 'number'
    })
    .option('min_planned_start', {
      describe: 'Minimum planned start date (ISO string)',
      type: 'string'
    })
    .option('max_planned_start', {
      describe: 'Maximum planned start date (ISO string)',
      type: 'string'
    })
    .option('min_planned_finish', {
      describe: 'Minimum planned finish date (ISO string)',
      type: 'string'
    })
    .option('max_planned_finish', {
      describe: 'Maximum planned finish date (ISO string)',
      type: 'string'
    })
    .option('archived', {
      describe: 'Include archived tasks',
      type: 'boolean',
      default: false
    })
    .strict()
    .help()
    .alias('help', 'h').argv

  const main = async () => {
    handle_cli_directory_registration(argv)

    let error
    try {
      const tasks = await list_tasks_from_filesystem({
        user_public_key: argv.user_public_key,
        status: argv.status,
        include_status: argv.include_status,
        exclude_status: argv.exclude_status,
        include_priority: argv.include_priority,
        exclude_priority: argv.exclude_priority,
        include_completed: argv.include_completed,
        tag_entity_ids: argv.tag_entity_ids,
        organization_ids: argv.organization_ids,
        person_ids: argv.person_ids,
        min_finish_by: argv.min_finish_by,
        max_finish_by: argv.max_finish_by,
        min_estimated_total_duration: argv.min_estimated_total_duration,
        max_estimated_total_duration: argv.max_estimated_total_duration,
        min_planned_start: argv.min_planned_start,
        max_planned_start: argv.max_planned_start,
        min_planned_finish: argv.min_planned_finish,
        max_planned_finish: argv.max_planned_finish,
        archived: argv.archived
      })
      console.log(`Found ${tasks.length} matching tasks`)
      console.log(JSON.stringify(tasks, null, 2))
    } catch (err) {
      error = err
      console.error('Error:', error.message)
    }
    process.exit(error ? 1 : 0)
  }

  main()
}
