import debug from 'debug'
import {
  update_github_issue_graphql,
  get_github_project_item_for_issue,
  update_github_project_item,
  get_github_issue_id,
  set_github_issue_parent,
  remove_github_issue_parent,
  create_github_issue_cross_reference
} from './github-api/index.mjs'
import { TASK_STATUS } from '#libs-shared/task-constants.mjs'
import { generate_labels_from_tags } from './github-entity-mapper.mjs'
import {
  analyze_relationship_changes,
  filter_actionable_relationship_changes
} from './analyze-relationship-changes.mjs'

const log = debug('sync-github-issues:sync-task-to-github-issue')

/**
 * Sync relationship changes to GitHub
 * @param {Object} params - Parameters
 * @param {string} params.github_issue_number - Current issue number
 * @param {string} params.github_repository_owner - Repository owner
 * @param {string} params.github_repository_name - Repository name
 * @param {Object} params.relations_changes - Analyzed relationship changes
 * @param {string} params.github_token - GitHub API token
 * @returns {Promise<boolean>} Success indicator
 */
async function sync_relationships_to_github({
  github_issue_number,
  github_repository_owner,
  github_repository_name,
  relations_changes,
  github_token
}) {
  log(
    `Syncing ${relations_changes.summary.total_actionable} relationship changes to GitHub`
  )

  let success = true

  try {
    // Get current issue ID for parent/child operations
    const current_issue_id = await get_github_issue_id({
      github_repository_owner,
      github_repository_name,
      issue_number: github_issue_number,
      github_token
    })

    // Handle parent/child relationship changes
    for (const change of relations_changes.parent_child) {
      try {
        log(
          `Processing parent/child change: ${change.action} ${change.relation_type}`
        )

        // Get target issue ID
        const target_issue_id = await get_github_issue_id({
          github_repository_owner: change.github_repository_owner,
          github_repository_name: change.github_repository_name,
          issue_number: change.github_issue_number,
          github_token
        })

        if (change.action === 'add') {
          if (change.relation_type === 'subtask_of') {
            // Current issue becomes subtask of target
            await set_github_issue_parent({
              issue_id: current_issue_id,
              parent_issue_id: target_issue_id,
              github_token
            })
            log(
              `Set issue #${github_issue_number} as subtask of #${change.github_issue_number}`
            )
          } else if (change.relation_type === 'has_subtask') {
            // Target issue becomes subtask of current
            await set_github_issue_parent({
              issue_id: target_issue_id,
              parent_issue_id: current_issue_id,
              github_token
            })
            log(
              `Set issue #${change.github_issue_number} as subtask of #${github_issue_number}`
            )
          }
        } else if (change.action === 'remove') {
          if (change.relation_type === 'subtask_of') {
            // Remove current issue from parent
            await remove_github_issue_parent({
              issue_id: current_issue_id,
              github_token
            })
            log(
              `Removed issue #${github_issue_number} from parent #${change.github_issue_number}`
            )
          } else if (change.relation_type === 'has_subtask') {
            // Remove target issue from current as parent
            await remove_github_issue_parent({
              issue_id: target_issue_id,
              github_token
            })
            log(
              `Removed issue #${change.github_issue_number} from parent #${github_issue_number}`
            )
          }
        }
      } catch (error) {
        log(`Error processing parent/child change: ${error.message}`)
        success = false
      }
    }

    // Handle cross-reference changes
    for (const change of relations_changes.cross_references) {
      try {
        if (change.action === 'add') {
          log(
            `Processing cross-reference addition: #${github_issue_number} -> #${change.github_issue_number}`
          )

          await create_github_issue_cross_reference({
            source_issue_number: github_issue_number,
            target_issue_number: change.github_issue_number,
            github_repository_owner,
            github_repository_name,
            github_token,
            comment_text: 'Related to'
          })
          log(
            `Created cross-reference from #${github_issue_number} to #${change.github_issue_number}`
          )
        } else if (change.action === 'remove') {
          // Cross-reference removal not supported by GitHub API
          log(
            `Skipping cross-reference removal (not supported by GitHub API): #${github_issue_number} -> #${change.github_issue_number}`
          )
        }
      } catch (error) {
        log(`Error processing cross-reference change: ${error.message}`)
        success = false
      }
    }

    log(
      `Relationship sync completed with ${success ? 'success' : 'some errors'}`
    )
    return success
  } catch (error) {
    log(`Error syncing relationships to GitHub: ${error.message}`)
    return false
  }
}

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
          github_project_number,
          github_token
        })

        if (project_item) {
          // Map the task status to GitHub project status
          const github_status = map_task_status_to_github_project_status(
            updates.status.to
          )

          // Find the status field from field definitions
          const status_field = project_item.field_definitions.find(
            (field) =>
              field.name &&
              field.name.toLowerCase() === 'status' &&
              field.options
          )

          let status_option_id = null
          if (status_field && status_field.options) {
            const status_option = status_field.options.find(
              (option) =>
                option.name.toLowerCase() === github_status.toLowerCase()
            )

            if (status_option) {
              status_option_id = status_option.id
              log(
                `Mapped task status "${updates.status.to}" to GitHub status "${status_option.name}" (ID: ${status_option_id})`
              )
            } else {
              log(
                `Could not find matching status option in project for status "${github_status}". Available options: ${status_field.options.map((o) => o.name).join(', ')}`
              )
            }
          }

          if (status_option_id) {
            // Update the status field using the field ID from field_definitions
            await update_github_project_item({
              project_id: project_item.project_id,
              item_id: project_item.item_id,
              field_updates: {
                [status_field.id]: {
                  singleSelectOptionId: status_option_id
                }
              },
              github_token
            })

            log('Updated GitHub project item status successfully')
          } else {
            log(`Could not find status option ID for status "${github_status}"`)
            project_update_success = false
          }
        } else {
          log(
            `Issue #${github_issue_number} not found in project #${github_project_number}`
          )
          project_update_success = false
        }
      } catch (error) {
        console.log(error)
        log(`Error updating GitHub project item: ${error.message}`)
        project_update_success = false
      }
    }

    // Handle relationship sync if there are relationship changes
    let relationship_sync_success = true
    if (github_update_data.relations_changes) {
      log('Syncing relationship changes to GitHub')
      relationship_sync_success = await sync_relationships_to_github({
        github_issue_number,
        github_repository_owner,
        github_repository_name,
        relations_changes: github_update_data.relations_changes,
        github_token
      })
    }

    log(`Synced task to GitHub issue #${github_issue_number}`)
    return (
      issue_update_success &&
      project_update_success &&
      relationship_sync_success
    )
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
      updates.status.to === TASK_STATUS.COMPLETED ||
      updates.status.to === TASK_STATUS.ABANDONED
        ? 'closed'
        : 'open'
  }

  // Handle tag updates if present
  if ('tags' in updates && updates.tags.to) {
    const tag_values = updates.tags.to

    if (Array.isArray(tag_values) && tag_values.length > 0) {
      // Generate labels from tags
      const labels = generate_labels_from_tags(tag_values)

      if (labels.length > 0) {
        github_update_data.labels = labels
      }
    }
  }

  // Handle relationship updates if present
  if ('relations' in updates && updates.relations) {
    const relations_changes = analyze_relationship_changes({
      from: updates.relations.from || [],
      to: updates.relations.to || []
    })

    // Filter to only actionable changes
    const actionable_changes =
      filter_actionable_relationship_changes(relations_changes)

    if (actionable_changes.summary.total_actionable > 0) {
      github_update_data.relations_changes = actionable_changes
    }
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
      return 'Completed'
    case TASK_STATUS.IN_PROGRESS:
      return 'In Progress'
    case TASK_STATUS.STARTED:
      return 'Started'
    case TASK_STATUS.PLANNED:
      return 'Planned'
    case TASK_STATUS.BLOCKED:
      return 'Blocked'
    case TASK_STATUS.WAITING:
      return 'Waiting'
    case TASK_STATUS.PAUSED:
      return 'Paused'
    case TASK_STATUS.ABANDONED:
      return 'Abandoned'
    case TASK_STATUS.NO_STATUS:
    default:
      return 'Planned'
  }
}
