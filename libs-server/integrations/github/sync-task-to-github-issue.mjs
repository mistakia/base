import debug from 'debug'
import {
  update_github_issue_graphql,
  get_github_project_item_for_issue,
  update_github_project_item
} from './github-api.mjs'
import { TASK_STATUS } from '#libs-shared/task-constants.mjs'

const log = debug('github-sync:sync-task-to-github-issue')

/**
 * Sync task updates to a GitHub issue
 *
 * @param {Object} options - Function options
 * @param {string} options.github_issue_number - GitHub issue number
 * @param {string} options.github_repository_owner - Repository owner
 * @param {string} options.github_repository_name - Repository name
 * @param {Object} options.updates - Fields to update
 * @param {string} options.github_token - GitHub token
 * @param {string} [options.github_project_number] - GitHub project number (if project updates are needed)
 * @returns {boolean} Success indicator
 */
export async function sync_task_to_github_issue({
  github_issue_number,
  github_repository_owner,
  github_repository_name,
  updates,
  github_token,
  github_project_number
}) {
  try {
    if (!github_issue_number) {
      log('Task is missing GitHub issue number')
      return false
    }

    // Prepare update data for issue update
    const github_update_data = format_github_issue_update_data({ updates })

    let issue_update_success = true
    let project_update_success = true

    // Skip issue update if no changes
    if (Object.keys(github_update_data).length > 0) {
      // Update GitHub issue using GraphQL API
      const result = await update_github_issue_graphql({
        github_repository_owner,
        github_repository_name,
        github_issue_number,
        github_token,
        data: github_update_data
      })

      issue_update_success = Boolean(result)
    }

    // Update project item if we have a project number and status has changed
    if (github_project_number && updates.status) {
      try {
        // Get project item info first to access field definitions and options
        const project_item = await get_github_project_item_for_issue({
          github_repository_owner,
          github_repository_name,
          github_issue_number,
          project_number: github_project_number,
          github_token
        })

        if (project_item) {
          // Map the task status to GitHub project status
          const github_status = map_task_status_to_github_project_status(
            updates.status
          )

          // Find the status field and the corresponding option ID
          let status_option_id = null
          if (project_item.status_field && project_item.status_field.options) {
            // Find the matching status option
            const status_option = find_closest_status_option(
              project_item.status_field.options,
              github_status
            )

            if (status_option) {
              status_option_id = status_option.id
              log(
                `Mapped task status "${updates.status}" to GitHub status "${status_option.name}" (ID: ${status_option_id})`
              )
            }
          } else {
            // Try to find status field from field definitions
            const status_field = project_item.field_definitions.find(
              (field) =>
                field.name &&
                field.name.toLowerCase() === 'status' &&
                field.options
            )

            if (status_field && status_field.options) {
              const status_option = find_closest_status_option(
                status_field.options,
                github_status
              )

              if (status_option) {
                status_option_id = status_option.id
                log(
                  `Mapped task status "${updates.status}" to GitHub status "${status_option.name}" (ID: ${status_option_id})`
                )
              }
            }
          }

          if (status_option_id) {
            // Find the status field from the item's fields
            const status_field_value = project_item.fields.find(
              (field) =>
                field.field &&
                field.field.name &&
                field.field.name.toLowerCase() === 'status'
            )

            if (status_field_value && status_field_value.field) {
              // Update the status field
              await update_github_project_item({
                project_id: project_item.project_id,
                item_id: project_item.item_id,
                field_updates: {
                  [status_field_value.field.id]: {
                    singleSelectOptionId: status_option_id
                  }
                },
                github_token
              })

              log('Updated GitHub project item status successfully')
            } else {
              log('Could not find status field in project item')
              project_update_success = false
            }
          } else {
            log(
              `Could not find matching status option in project for status "${github_status}"`
            )
            project_update_success = false
          }
        } else {
          log(
            `Issue #${github_issue_number} not found in project #${github_project_number}`
          )
          project_update_success = false
        }
      } catch (error) {
        log(`Error updating GitHub project item: ${error.message}`)
        project_update_success = false
      }
    }

    log(`Synced task to GitHub issue #${github_issue_number}`)
    return issue_update_success && project_update_success
  } catch (error) {
    console.log(error)
    log(`Error syncing task to GitHub: ${error.message}`)
    return false
  }
}

/**
 * Formats task updates into GitHub issue update data format
 * Extracts the 'to' value from change objects
 *
 * @param {Object} options - Options object
 * @param {Object} options.updates - Task updates to format (change objects with to/from/changed properties)
 * @returns {Object} Formatted GitHub issue update data
 */
function format_github_issue_update_data({ updates }) {
  const github_update_data = {}

  if ('title' in updates) {
    // Extract the 'to' value from the change object
    github_update_data.title = updates.title.to
  }

  if ('description' in updates) {
    // Extract the 'to' value from the change object
    github_update_data.body = updates.description.to
  }

  if ('status' in updates) {
    // Handle status updates based on the 'to' value
    github_update_data.state =
      updates.status.to === TASK_STATUS.COMPLETED ? 'closed' : 'open'
  }

  return github_update_data
}

/**
 * Maps task status to GitHub project status string
 *
 * @param {string} task_status - Task status from task constants
 * @returns {string} - GitHub project status string
 */
function map_task_status_to_github_project_status(task_status) {
  switch (task_status) {
    case TASK_STATUS.COMPLETED:
      return 'Done'
    case TASK_STATUS.IN_PROGRESS:
    case TASK_STATUS.STARTED:
      return 'In Progress'
    case TASK_STATUS.PLANNED:
      return 'To Do'
    case TASK_STATUS.BLOCKED:
      return 'Blocked'
    case TASK_STATUS.WAITING:
    case TASK_STATUS.PAUSED:
      return 'On Hold'
    case TASK_STATUS.CANCELLED:
      return 'Cancelled'
    case TASK_STATUS.NO_STATUS:
    default:
      return 'To Do'
  }
}

/**
 * Finds the closest status option in GitHub project for a given status name
 * Uses fuzzy matching to find the most appropriate option
 *
 * @param {Array} status_options - Array of status options from GitHub project
 * @param {string} status_name - Status name to match
 * @returns {Object|null} - Matching status option or null
 */
function find_closest_status_option(status_options, status_name) {
  if (!status_options || !status_options.length) {
    return null
  }

  // First try exact match (case insensitive)
  const status_name_lower = status_name.toLowerCase()
  const exact_match = status_options.find(
    (option) => option.name.toLowerCase() === status_name_lower
  )

  if (exact_match) {
    return exact_match
  }

  // Try common synonyms/fuzzy match
  const mappings = {
    done: ['completed', 'finished', 'closed', 'complete', 'done'],
    'in progress': ['in progress', 'wip', 'started', 'ongoing', 'working'],
    'to do': ['to do', 'todo', 'planned', 'backlog', 'ready', 'open', 'new'],
    blocked: ['blocked', 'impediment', 'stuck'],
    'on hold': ['on hold', 'waiting', 'paused', 'hold'],
    cancelled: ['cancelled', 'canceled', 'abandoned', 'dropped']
  }

  // Find the category that our status belongs to
  let matching_category = null
  for (const [category, synonyms] of Object.entries(mappings)) {
    if (synonyms.includes(status_name_lower)) {
      matching_category = category
      break
    }
  }

  if (matching_category) {
    // Find a GitHub option that matches this category
    for (const option of status_options) {
      const option_name_lower = option.name.toLowerCase()

      for (const [category, synonyms] of Object.entries(mappings)) {
        if (
          synonyms.includes(option_name_lower) &&
          category === matching_category
        ) {
          return option
        }
      }
    }
  }

  // If all else fails, try to match by first character or return the first option
  const first_char = status_name_lower.charAt(0)
  const first_char_match = status_options.find(
    (option) => option.name.toLowerCase().charAt(0) === first_char
  )

  return first_char_match || status_options[0]
}
