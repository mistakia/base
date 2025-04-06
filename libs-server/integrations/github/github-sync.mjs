import debug from 'debug'
import db from '#db'
import { github } from '#libs-server'
import { normalize_github_issue } from './github-mapper.mjs'

import {
  create_content_identifier,
  detect_field_changes,
  find_entity_by_external_id,
  get_or_create_sync_record
} from '../sync/sync-core.mjs'

import {
  save_import_data,
  record_import_history,
  find_previous_import_files
} from '../sync/import-manager.mjs'

import {
  detect_conflicts,
  resolve_entity_conflicts,
  apply_resolutions
} from '../sync/conflict-resolver.mjs'

const log = debug('github-sync')

/**
 * Process GitHub issues for import
 *
 * @param {Object} options - Function options
 * @param {Array} options.issues - GitHub issues to process
 * @param {string} options.repo_owner - Repository owner
 * @param {string} options.repo_name - Repository name
 * @param {string} options.user_id - User ID
 * @param {Object} [options.project_items_map] - Project items map (optional)
 * @param {string} [options.import_history_base_directory] - Import history base directory (optional)
 * @param {string} [options.github_token] - GitHub token (optional)
 * @returns {Object} Import results
 */
export async function process_github_issues({
  issues,
  repo_owner,
  repo_name,
  user_id,
  project_items_map,
  import_history_base_directory,
  github_token
}) {
  const import_results = {
    created: 0,
    updated: 0,
    skipped: 0,
    conflicts: 0,
    errors: 0,
    processed_issues: []
  }

  for (const issue of issues) {
    try {
      // Skip pull requests
      if (issue.pull_request) {
        log(`Skipping PR #${issue.number}`)
        import_results.skipped++
        import_results.processed_issues.push({
          issue_number: issue.number,
          title: issue.title,
          action: 'skipped',
          reason: 'pull_request'
        })
        continue
      }

      // Get project item if available
      const project_item = project_items_map?.[issue.number]

      // Process the issue
      const issue_result = await process_single_github_issue({
        issue,
        repo_owner,
        repo_name,
        user_id,
        project_item,
        import_history_base_directory,
        github_token
      })

      // Update results
      import_results[issue_result.action]++
      import_results.processed_issues.push({
        issue_number: issue.number,
        title: issue.title,
        entity_id: issue_result.entity_id,
        action: issue_result.action,
        conflicts: issue_result.conflicts || []
      })

      if (issue_result.conflicts_found) {
        import_results.conflicts++
      }
    } catch (error) {
      log(`Error processing issue #${issue.number}: ${error.message}`)
      log(error)
      import_results.errors++
      import_results.processed_issues.push({
        issue_number: issue.number,
        title: issue.title,
        action: 'error',
        error: error.message
      })
    }
  }

  return import_results
}

/**
 * Process a single GitHub issue
 *
 * @param {Object} options - Function options
 * @param {Object} options.issue - GitHub issue to process
 * @param {string} options.repo_owner - Repository owner
 * @param {string} options.repo_name - Repository name
 * @param {string} options.user_id - User ID
 * @param {Object} [options.project_item] - Project item (optional)
 * @param {string} [options.import_history_base_directory] - Import history base directory (optional)
 * @param {string} [options.github_token] - GitHub token (optional)
 * @returns {Object} Process result
 */
export async function process_single_github_issue({
  issue,
  repo_owner,
  repo_name,
  user_id,
  project_item = null,
  import_history_base_directory = null,
  github_token = null
}) {
  if (!repo_owner) {
    throw new Error('Missing repository owner')
  }

  if (!repo_name) {
    throw new Error('Missing repository name')
  }

  // Extract repo information
  const external_system = 'github'
  const external_id = `${repo_owner}/${repo_name}:${issue.number}`

  // Normalize issue data
  const normalized_issue = normalize_github_issue({
    issue,
    repo_owner,
    repo_name,
    project_item
  })

  // Create content identifier
  const import_cid = await create_content_identifier(normalized_issue)

  // Check if entity already exists
  const existing_entity = await find_entity_by_external_id({
    external_system,
    external_id
  })

  if (existing_entity) {
    // Entity exists - update
    return await update_existing_task_from_github_issue({
      entity_id: existing_entity.entity_id,
      issue,
      normalized_issue,
      repo_owner,
      repo_name,
      import_cid,
      import_history_base_directory,
      github_token
    })
  } else {
    // Entity doesn't exist - create new
    return await create_new_task_from_github_issue({
      issue,
      normalized_issue,
      repo_owner,
      repo_name,
      user_id,
      external_id,
      import_cid,
      import_history_base_directory
    })
  }
}

/**
 * Create metadata entries for a GitHub issue
 *
 * @param {Object} options - Function options
 * @param {string} options.entity_id - Entity ID
 * @param {Object} options.issue - GitHub issue
 * @param {Object} options.normalized_issue - Normalized issue data
 * @param {string} options.repo_owner - Repository owner
 * @param {string} options.repo_name - Repository name
 * @returns {Array} Metadata entries to insert
 */
export function create_github_metadata_entries({
  entity_id,
  issue,
  normalized_issue,
  repo_owner,
  repo_name
}) {
  const metadata_entries = [
    {
      entity_id,
      key: 'external_id',
      value: `github:${repo_owner}/${repo_name}:${issue.number}`
    },
    { entity_id, key: 'external_url', value: normalized_issue.external_url },
    { entity_id, key: 'github_updated_at', value: normalized_issue.updated_at },
    { entity_id, key: 'github_issue_number', value: String(issue.number) },
    {
      entity_id,
      key: 'github_repo',
      value: `${repo_owner}/${repo_name}`
    }
  ]

  // Add labels metadata if available
  if (issue.labels && issue.labels.length > 0) {
    metadata_entries.push({
      entity_id,
      key: 'github_labels',
      value: JSON.stringify(issue.labels.map((l) => l.name))
    })
  }

  // Add project metadata if available
  if (normalized_issue.github_project_item_id) {
    metadata_entries.push({
      entity_id,
      key: 'github_project_item_id',
      value: normalized_issue.github_project_item_id
    })
  }

  return metadata_entries
}

/**
 * Create a new task from GitHub issue
 *
 * @param {Object} options - Function options
 * @param {Object} options.issue - GitHub issue
 * @param {Object} options.normalized_issue - Normalized issue data
 * @param {string} options.repo_owner - Repository owner
 * @param {string} options.repo_name - Repository name
 * @param {string} options.user_id - User ID
 * @param {string} options.external_id - External ID
 * @param {string} options.import_cid - Content ID of import
 * @param {string} options.import_history_base_directory - Base directory for import history
 * @returns {Object} Create result
 */
export async function create_new_task_from_github_issue({
  issue,
  normalized_issue,
  repo_owner,
  repo_name,
  user_id,
  external_id,
  import_cid,
  import_history_base_directory
}) {
  log(
    `Creating new task for GitHub issue #${issue.number} in ${repo_owner}/${repo_name}`
  )

  // Prepare entity data
  const entity_data = {
    title: normalized_issue.title,
    type: 'task',
    description: normalized_issue.description,
    user_id,
    created_at: new Date(normalized_issue.created_at),
    updated_at: new Date(normalized_issue.updated_at)
  }

  // Insert entity
  const [new_entity] = await db('entities').insert(entity_data).returning('*')

  const entity_id = new_entity.entity_id

  // Prepare task data
  const task_data = {
    entity_id,
    status: normalized_issue.status,
    priority: normalized_issue.priority,
    finished_at: normalized_issue.finished_at
      ? new Date(normalized_issue.finished_at)
      : null
  }

  // Add dates if available
  if (normalized_issue.start_by) {
    task_data.start_by = new Date(normalized_issue.start_by)
  }

  if (normalized_issue.finish_by) {
    task_data.finish_by = new Date(normalized_issue.finish_by)
  }

  // Insert task
  await db('tasks').insert(task_data)

  // Create and save metadata
  const metadata_entries = create_github_metadata_entries({
    entity_id,
    issue,
    normalized_issue,
    repo_owner,
    repo_name
  })

  // Insert metadata
  await db('entity_metadata').insert(metadata_entries)

  // Create sync record
  const sync_record = await get_or_create_sync_record({
    entity_id,
    external_system: 'github',
    external_id
  })

  // Save import data
  await save_import_data({
    external_system: 'github',
    entity_id,
    raw_data: issue,
    processed_data: normalized_issue,
    import_history_base_directory
  })

  // Record import in history
  await record_import_history({
    sync_id: sync_record.sync_id,
    raw_data: issue,
    import_cid
  })

  return {
    entity_id,
    action: 'created',
    conflicts_found: false,
    sync_record
  }
}

/**
 * Update entity and task with normalized GitHub issue data
 *
 * @param {Object} options - Function options
 * @param {string} options.entity_id - Entity ID
 * @param {Object} options.normalized_issue - Normalized issue data
 * @returns {Promise<void>}
 */
export async function update_entity_from_normalized_issue({
  entity_id,
  normalized_issue
}) {
  // Update entity
  await db('entities').where({ entity_id }).update({
    title: normalized_issue.title,
    description: normalized_issue.description,
    updated_at: new Date()
  })

  // Update task fields
  const task_updates = {
    status: normalized_issue.status,
    priority: normalized_issue.priority,
    finished_at: normalized_issue.finished_at
      ? new Date(normalized_issue.finished_at)
      : null
  }

  // Add dates if available
  if (normalized_issue.start_by) {
    task_updates.start_by = new Date(normalized_issue.start_by)
  }

  if (normalized_issue.finish_by) {
    task_updates.finish_by = new Date(normalized_issue.finish_by)
  }

  await db('tasks').where({ entity_id }).update(task_updates)
}

/**
 * Update existing task from GitHub issue
 *
 * @param {Object} options - Function options
 * @param {string} options.entity_id - Entity ID
 * @param {Object} options.issue - GitHub issue
 * @param {Object} options.normalized_issue - Normalized issue data
 * @param {string} options.repo_owner - Repository owner
 * @param {string} options.repo_name - Repository name
 * @param {string} options.import_cid - Content ID of import
 * @param {string} options.import_history_base_directory - Base directory for import history
 * @param {string} options.github_token - GitHub token
 * @returns {Object} Update result
 */
export async function update_existing_task_from_github_issue({
  entity_id,
  issue,
  normalized_issue,
  repo_owner,
  repo_name,
  import_cid,
  import_history_base_directory,
  github_token
}) {
  log(
    `Updating existing task for GitHub issue #${issue.number} in ${repo_owner}/${repo_name}`
  )

  // Get entity
  const entity = await db('entities').where({ entity_id }).first()

  if (!entity) {
    throw new Error(`Entity ${entity_id} not found`)
  }

  // Get or create sync record
  const external_id = `${repo_owner}/${repo_name}:${issue.number}`
  const sync_record = await get_or_create_sync_record({
    entity_id,
    external_system: 'github',
    external_id
  })

  // Find previous import to detect changes
  const previous_import = await find_previous_import_files({
    external_system: 'github',
    entity_id,
    import_history_base_directory
  })

  // Detect changes
  let detected_changes = null
  if (previous_import && previous_import.processed_data) {
    detected_changes = detect_field_changes({
      current_data: normalized_issue,
      previous_data: previous_import.processed_data
    })
  }

  // If no changes, skip update
  if (!detected_changes) {
    log(`No changes detected for issue #${issue.number}, skipping update`)
    return {
      entity_id,
      action: 'skipped',
      conflicts_found: false
    }
  }

  // Save import data AFTER we've detected changes
  await save_import_data({
    external_system: 'github',
    entity_id,
    raw_data: issue,
    processed_data: normalized_issue,
    import_history_base_directory
  })

  // Record import in history
  await record_import_history({
    sync_id: sync_record.sync_id,
    raw_data: issue,
    import_cid
  })

  // Detect conflicts
  const detect_conflicts_options = {
    entity,
    external_data: normalized_issue,
    sync_record,
    changes: detected_changes,
    import_cid
  }

  const detected_conflicts = await detect_conflicts(detect_conflicts_options)

  const has_conflicts = Object.keys(detected_conflicts).length > 0

  if (has_conflicts) {
    log(
      `Detected conflicts: ${JSON.stringify(Object.keys(detected_conflicts))}`
    )
  }

  // Resolve conflicts
  const conflict_resolution_result = has_conflicts
    ? await resolve_entity_conflicts({
        entity_id,
        conflicts: detected_conflicts,
        external_system: 'github'
      })
    : { resolutions: {} }

  const resolutions = conflict_resolution_result.resolutions || {}

  // Apply resolutions or update directly
  if (has_conflicts) {
    await apply_resolutions({
      entity_id,
      resolutions,
      update_external_entity: async (external_id, updates) => {
        await sync_task_back_to_github({
          entity_id,
          repo_owner,
          repo_name,
          updates,
          github_token
        })
      },
      external_id
    })
  } else {
    // No conflicts - update entity directly
    await update_entity_from_normalized_issue({
      entity_id,
      normalized_issue
    })
  }

  // Update metadata
  const metadata_updates = [
    { entity_id, key: 'github_updated_at', value: normalized_issue.updated_at }
  ]

  if (issue.labels && issue.labels.length > 0) {
    metadata_updates.push({
      entity_id,
      key: 'github_labels',
      value: JSON.stringify(issue.labels.map((l) => l.name))
    })
  }

  for (const metadata of metadata_updates) {
    await db('entity_metadata')
      .insert(metadata)
      .onConflict(['entity_id', 'key'])
      .merge()
  }

  return {
    entity_id,
    action: 'updated',
    conflicts_found: has_conflicts,
    conflicts: Object.keys(detected_conflicts),
    sync_record
  }
}

/**
 * Sync task back to GitHub
 *
 * @param {Object} options - Function options
 * @param {string} options.entity_id - Entity ID
 * @param {string} options.repo_owner - Repository owner
 * @param {string} options.repo_name - Repository name
 * @param {Object} options.updates - Fields to update
 * @param {string} options.github_token - GitHub token
 * @returns {boolean} Success indicator
 */
export async function sync_task_back_to_github({
  entity_id,
  repo_owner,
  repo_name,
  updates,
  github_token
}) {
  try {
    // Get task data
    const task = await db('tasks')
      .join('entities', 'tasks.entity_id', 'entities.entity_id')
      .select('tasks.*', 'entities.title', 'entities.description')
      .where('tasks.entity_id', entity_id)
      .first()

    if (!task) {
      log(`Task ${entity_id} not found for GitHub sync`)
      return false
    }

    // Get GitHub metadata
    const github_metadata = await db('entity_metadata')
      .where({ entity_id })
      .whereIn('key', ['github_issue_number', 'github_repo'])
      .reduce((result, { key, value }) => {
        result[key] = value
        return result
      }, {})

    if (!github_metadata.github_issue_number || !github_metadata.github_repo) {
      log(`Task ${entity_id} is missing GitHub metadata`)
      return false
    }

    // Prepare update data
    const github_update_data = prepare_github_update_data({ updates })

    // Skip update if no changes
    if (Object.keys(github_update_data).length === 0) {
      return false
    }

    // Update GitHub issue
    await github.update_github_issue({
      owner: repo_owner,
      repo: repo_name,
      issue_number: parseInt(github_metadata.github_issue_number),
      github_token,
      data: github_update_data
    })

    log(
      `Synced task ${entity_id} to GitHub issue #${github_metadata.github_issue_number}`
    )
    return true
  } catch (error) {
    log(`Error syncing task to GitHub: ${error.message}`)
    return false
  }
}

/**
 * Prepare GitHub update data from task updates
 *
 * @param {Object} options - Function options
 * @param {Object} options.updates - Fields to update
 * @returns {Object} GitHub update data
 */
function prepare_github_update_data({ updates }) {
  const github_update_data = {}

  if ('title' in updates) {
    github_update_data.title = updates.title
  }

  if ('description' in updates) {
    github_update_data.body = updates.description
  }

  if ('status' in updates) {
    github_update_data.state =
      updates.status === 'Completed' ? 'closed' : 'open'
  }

  return github_update_data
}
