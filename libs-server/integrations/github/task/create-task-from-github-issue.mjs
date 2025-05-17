import debug from 'debug'
import { write_entity_to_filesystem } from '#libs-server/entity/filesystem/index.mjs'
import {
  create_sync_record,
  save_import_data
} from '#libs-server/sync/index.mjs'
import { format_task_path_for_github_issue } from './format-task-path-for-github-issue.mjs'

const log = debug('github:task')

/**
 * Creates a slug from a string by converting to lowercase, replacing spaces with hyphens,
 * and removing special characters
 *
 * @param {string} text - The text to slugify
 * @param {Object} options - Slugify options
 * @param {boolean} [options.lower=true] - Convert to lowercase
 * @param {boolean} [options.strict=false] - Remove characters that don't match the allowed pattern
 * @param {RegExp} [options.remove=/[*+~.()'"!:@]/g] - Characters to remove
 * @returns {string} - Slugified string
 */
function slugify(text, options = {}) {
  const { lower = true, strict = false, remove = /[*+~.()'"!:@]/g } = options

  let result = text.toString()

  // Remove specified characters
  if (remove) {
    result = result.replace(remove, '')
  }

  // Convert to lowercase if option is enabled
  if (lower) {
    result = result.toLowerCase()
  }

  // Replace spaces and other characters with hyphens
  result = result
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/&/g, '-and-') // Replace & with 'and'
    .replace(/[^\w\-]+/g, '') // Remove all non-word characters except hyphens
    .replace(/--+/g, '-') // Replace multiple hyphens with single hyphen
    .replace(/^-+/, '') // Trim hyphens from start
    .replace(/-+$/, '') // Trim hyphens from end

  return result
}

/**
 * Creates a new task in the filesystem from a GitHub issue and records sync info in the database
 *
 * @param {Object} options - Function options
 * @param {Object} options.github_issue - The GitHub issue data
 * @param {Object} options.normalized_github_issue - The normalized GitHub issue data
 * @param {string} options.github_repository_owner - Repository owner
 * @param {string} options.github_repository_name - Repository name
 * @param {string} options.user_base_directory - Base directory for user data
 * @param {string} options.user_id - The user creating the task
 * @param {string} options.external_id - External identifier for the issue
 * @param {string} options.import_cid - Content identifier for import
 * @param {string} [options.import_history_base_directory] - Base directory for import history
 * @param {Object} [options.trx=null] - Optional database transaction
 * @returns {Promise<Object>} - The created task data with entity_id
 */
export async function create_task_from_github_issue({
  github_issue,
  normalized_github_issue,
  github_repository_owner,
  github_repository_name,
  user_base_directory,
  user_id,
  external_id,
  import_cid,
  import_history_base_directory = null,
  trx = null
}) {
  try {
    log(`Creating task from GitHub issue #${github_issue.number}`)

    if (!github_issue) {
      throw new Error('Missing github_issue parameter')
    }

    if (!github_repository_owner) {
      throw new Error('Missing github_repository_owner parameter')
    }

    if (!github_repository_name) {
      throw new Error('Missing github_repository_name parameter')
    }

    if (!user_base_directory) {
      throw new Error('Missing user_base_directory parameter')
    }

    if (!user_id) {
      throw new Error('Missing user_id parameter')
    }

    // Use normalized issue data from the github_issue object
    const task_entity_properties = normalized_github_issue

    if (!task_entity_properties) {
      throw new Error('Missing normalized GitHub issue data')
    }

    // Generate slug from title
    const slug = slugify(task_entity_properties.title, {
      lower: true,
      strict: true,
      remove: /[*+~.()'"!:@]/g
    })

    // Generate task filename
    const absolute_path = format_task_path_for_github_issue({
      github_repository_owner,
      github_repository_name,
      github_issue_number: github_issue.number,
      user_base_directory,
      task_filename_slug: slug
    })

    // Add import tracking data if available
    if (import_cid) {
      task_entity_properties.import_cid = import_cid
    }

    if (import_history_base_directory) {
      task_entity_properties.import_history_path = import_history_base_directory
    }

    // Write task to filesystem - this will also generate an entity_id
    const { entity_id, success } = await write_entity_to_filesystem({
      absolute_path,
      entity_properties: task_entity_properties,
      entity_type: 'task',
      entity_content: task_entity_properties.description || ''
    })

    if (!success) {
      throw new Error(
        `Failed to write task for GitHub issue #${github_issue.number} to filesystem`
      )
    }

    // Create sync record in database
    const sync_data = {
      github_issue_number: github_issue.number,
      github_issue_id: github_issue.id,
      github_repository_owner,
      github_repository_name,
      last_update_time: github_issue.updated_at
    }

    await create_sync_record({
      entity_id,
      external_system: 'github',
      external_id,
      sync_data,
      trx
    })

    log(
      `Successfully created task with entity_id ${entity_id} for GitHub issue #${github_issue.number}`
    )

    // Save import data
    await save_import_data({
      external_system: 'github',
      entity_id,
      raw_data: github_issue,
      processed_data: normalized_github_issue,
      import_history_base_directory
    })

    return {
      entity_id,
      task_entity_properties,
      task_path: absolute_path
    }
  } catch (error) {
    log(`Error creating task from GitHub issue: ${error.message}`)
    throw error
  }
}
