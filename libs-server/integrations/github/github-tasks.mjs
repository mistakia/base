import db from '#db'
import debug from 'debug'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { github } from '#libs-server'

const log = debug('github-tasks')

const get_project_field_value = (item, field_name) => {
  if (!item.fieldValues || !item.fieldValues.nodes) {
    return null
  }

  const field = item.fieldValues.nodes.find(
    (node) => node.field && node.field.name === field_name
  )

  if (!field) return null

  // Handle different field types
  if (field.text) return field.text
  if (field.date) return field.date
  if (field.name) return field.name

  return null
}

export const save_task_metadata = async (entity_id, metadata = {}) => {
  const entries = Object.entries(metadata).map(([key, value]) => ({
    entity_id,
    key,
    value: typeof value === 'object' ? JSON.stringify(value) : String(value)
  }))

  if (entries.length) {
    // Use knex transaction to ensure atomicity
    await db.transaction(async (trx) => {
      // For each metadata entry, insert or update
      for (const entry of entries) {
        await trx('entity_metadata')
          .insert(entry)
          .onConflict(['entity_id', 'key'])
          .merge()
      }
    })

    log(`Saved metadata for entity ${entity_id}`)
  }
}

export const get_task_metadata = async (entity_id, keys = []) => {
  const query = db('entity_metadata')
    .select('key', 'value')
    .where({ entity_id })

  if (keys.length) {
    query.whereIn('key', keys)
  }

  const results = await query

  // Convert to object
  return results.reduce((acc, { key, value }) => {
    try {
      // Try to parse JSON values
      acc[key] = JSON.parse(value)
    } catch (e) {
      // If not JSON, use as is
      acc[key] = value
    }
    return acc
  }, {})
}

export const extract_project_issue_metadata = (issue, project_item) => {
  if (!project_item) return {}

  const metadata = {}

  // Extract project fields
  const status_value = get_project_field_value(project_item, 'Status')
  const priority_value = get_project_field_value(project_item, 'Priority')
  const start_by =
    get_project_field_value(project_item, 'start_by') ||
    get_project_field_value(project_item, 'Start By')
  const finish_by =
    get_project_field_value(project_item, 'finish_by') ||
    get_project_field_value(project_item, 'Finish By') ||
    get_project_field_value(project_item, 'Due Date')

  if (status_value) {
    metadata.project_status = status_value
  }

  if (priority_value) {
    metadata.project_priority = priority_value
  }

  if (start_by) {
    metadata.start_by = start_by
  }

  if (finish_by) {
    metadata.finish_by = finish_by
  }

  if (project_item.id) {
    metadata.github_project_item_id = project_item.id
  }

  return metadata
}

const format_status = (string) => {
  const string_lower = string.toLowerCase()

  switch (string_lower) {
    case 'in progress':
      return 'In Progress'
    case 'done':
    case 'completed':
      return 'Completed'
    case 'cancelled':
      return 'Cancelled'
    case 'planned':
    case 'todo':
    case 'to do':
      return 'Planned'
    case 'blocked':
      return 'Blocked'
    case 'started':
      return 'Started'
    case 'waiting':
      return 'Waiting'
    case 'paused':
      return 'Paused'
    case 'no status':
      return 'No status'
    default:
      log(`Unknown project status: ${string}`)
      return string
  }
}

const format_priority = (string) => {
  const string_lower = string.toLowerCase()

  switch (string_lower) {
    case 'critical':
      return 'Critical'
    case 'high':
      return 'High'
    case 'medium':
      return 'Medium'
    case 'low':
      return 'Low'
    case 'none':
      return 'None'
    default:
      log(`Unknown project priority: ${string}`)
      return string
  }
}

// Helper function to map project status to our internal task status
const extract_task_status_from_github_project_field = ({
  project_status_value,
  issue_state,
  issue_labels
}) => {
  const status = format_status(project_status_value)
  if (status) {
    return { status, source: 'project' }
  }

  // Fall back to GitHub state
  return {
    status: extract_task_status_from_github_labels({
      issue_state,
      issue_labels
    }),
    source: 'github'
  }
}

// Helper function to determine task status from project metadata or GitHub state
const extract_task_status = ({
  project_metadata,
  issue_state,
  issue_labels
}) => {
  // give priority to project status
  if (project_metadata.project_status) {
    const result = extract_task_status_from_github_project_field({
      project_status_value: project_metadata.project_status,
      issue_state,
      issue_labels
    })

    return result
  }

  // Default to GitHub state
  return {
    status: extract_task_status_from_github_labels({
      issue_state,
      issue_labels
    }),
    source: 'github'
  }
}

const extract_task_status_from_github_labels = ({
  github_state,
  github_labels = []
}) => {
  const status_label = github_labels.find((label) => {
    const label_name = label.name.toLowerCase()
    return label_name.startsWith('status:') || label_name.startsWith('status/')
  })

  if (status_label) {
    const status = format_status_label(status_label.name)
    if (status) {
      return { status, source: 'label' }
    }
  }

  if (github_state === 'closed') return 'Completed'

  return null
}

const format_status_label = (label_name) => {
  const label_name_lower = label_name.toLowerCase()

  if (
    label_name_lower === 'in-progress' ||
    label_name_lower === 'in progress' ||
    label_name_lower === 'in_progress'
  ) {
    return 'In Progress'
  }

  if (label_name_lower === 'blocked') return 'Blocked'
  if (label_name_lower === 'waiting') return 'Waiting'
  if (label_name_lower === 'planned') return 'Planned'
  if (label_name_lower === 'started') return 'Started'
  if (label_name_lower === 'paused') return 'Paused'

  log(`Unknown status label: ${label_name}`)
  return null
}

// Helper function to map project priority to our internal priority values
const extract_task_priority_from_project_priority_field = ({
  project_priority_value
}) => {
  const priority = format_priority(project_priority_value)
  if (priority) {
    return { priority, source: 'project' }
  }

  return { priority: null, source: 'default' }
}

// Helper function to determine priority from labels
const extract_task_priority_from_issue_labels = ({ issue_labels }) => {
  const priority_label = issue_labels.find(
    (l) =>
      l.name.toLowerCase().startsWith('priority:') ||
      l.name.toLowerCase().startsWith('priority/') ||
      ['high', 'medium', 'low', 'critical'].includes(l.name.toLowerCase())
  )

  if (priority_label) {
    const priority_label_string = priority_label.name
      .toLowerCase()
      .includes(':')
      ? priority_label.name.split(':')[1].trim()
      : priority_label.name.toLowerCase().includes('/')
        ? priority_label.name.split('/')[1].trim()
        : priority_label.name.toLowerCase()
    const priority = format_priority(priority_label_string)
    if (priority) {
      return { priority, source: 'label' }
    }
  }

  return { priority: null, source: 'default' }
}

// Helper function to determine task priority
const extract_task_priority = ({ project_metadata, issue_labels }) => {
  if (project_metadata.project_priority) {
    // Map project priority to our priority values
    const result = extract_task_priority_from_project_priority_field({
      project_priority_value: project_metadata.project_priority
    })
    log(`Using priority "${result.priority}" from project priority field`)
    return result
  }

  // Otherwise, try to determine from labels
  return extract_task_priority_from_issue_labels({ issue_labels })
}

// Create or update task from GitHub issue
export const create_or_update_task_from_github_issue = async ({
  issue,
  repo_info,
  user_id,
  force_update = false,
  project_item = null
}) => {
  // Convert user_id from hex if needed
  if (typeof user_id === 'string' && /^[0-9a-f]+$/.test(user_id)) {
    user_id = Buffer.from(user_id, 'hex')
  }

  const { owner, repo } = repo_info
  const {
    number,
    title,
    body,
    state,
    labels = [],
    created_at,
    updated_at,
    closed_at
  } = issue

  // Generate a unique external_id that includes repo info
  const external_id = `github:${owner}/${repo}:${number}`

  // Extract project metadata if available
  const project_metadata = extract_project_issue_metadata(issue, project_item)

  // Determine task status
  const { status } = extract_task_status({
    project_metadata,
    issue_state: state,
    issue_labels: labels
  })

  // Determine task priority
  const { priority } = extract_task_priority({
    project_metadata,
    issue_labels: labels
  })

  // Check if task already exists
  const existing_task = await db('entity_metadata')
    .select('entity_id')
    .where({ key: 'external_id', value: external_id })
    .first()

  if (existing_task) {
    // Task exists, check if it needs updating
    const task_metadata = await get_task_metadata(existing_task.entity_id, [
      'github_updated_at'
    ])

    // Only update if the GitHub issue has changed or force update is enabled
    if (
      !force_update &&
      task_metadata.github_updated_at &&
      task_metadata.github_updated_at === updated_at
    ) {
      return {
        entity_id: existing_task.entity_id,
        action: 'skipped'
      }
    }

    log(`Updating existing task for issue #${number} in ${owner}/${repo}`)

    // Update the entity
    await db('entities').where({ entity_id: existing_task.entity_id }).update({
      title,
      description: body,
      updated_at: new Date()
    })

    // Update task fields
    const task_update = {
      status,
      priority,
      finished_at: closed_at ? new Date(closed_at) : null
    }

    // Add dates from project if available
    if (project_metadata.start_by) {
      task_update.start_by = new Date(project_metadata.start_by)
    }

    if (project_metadata.finish_by) {
      task_update.finish_by = new Date(project_metadata.finish_by)
    }

    // Update the task
    await db('tasks')
      .where({ entity_id: existing_task.entity_id })
      .update(task_update)

    // Merge project metadata with standard metadata
    const all_metadata = {
      external_id,
      external_url: issue.html_url,
      github_updated_at: updated_at,
      github_issue_number: number,
      github_repo: `${owner}/${repo}`,
      github_labels: JSON.stringify(labels.map((l) => l.name)),
      ...project_metadata
    }

    // Update metadata
    await save_task_metadata(existing_task.entity_id, all_metadata)

    return {
      entity_id: existing_task.entity_id,
      action: 'updated',
      task_data: {
        title,
        status,
        priority,
        start_by: task_update.start_by,
        finish_by: task_update.finish_by,
        finished_at: task_update.finished_at
      }
    }
  } else {
    // Create new task
    log(`Creating new task for issue #${number} in ${owner}/${repo}`)

    // Prepare entity data
    const entity_data = {
      title,
      type: 'task',
      description: body,
      user_id,
      created_at: new Date(created_at),
      updated_at: new Date(updated_at)
    }

    // Insert into entities table
    const result = await db('entities')
      .insert(entity_data)
      .returning('entity_id')

    // Extract the entity_id from the result
    const entity_id = result[0].entity_id || result[0]

    // Prepare task data
    const task_data = {
      entity_id,
      status,
      priority,
      finished_at: closed_at ? new Date(closed_at) : null
    }

    // Add dates from project if available
    if (project_metadata.start_by) {
      task_data.start_by = new Date(project_metadata.start_by)
    }

    if (project_metadata.finish_by) {
      task_data.finish_by = new Date(project_metadata.finish_by)
    }

    // Insert into tasks table
    await db('tasks').insert(task_data)

    // Merge project metadata with standard metadata
    const all_metadata = {
      external_id,
      external_url: issue.html_url,
      github_updated_at: updated_at,
      github_issue_number: number,
      github_repo: `${owner}/${repo}`,
      github_labels: JSON.stringify(labels.map((l) => l.name)),
      ...project_metadata
    }

    // Save metadata
    await save_task_metadata(entity_id, all_metadata)

    return {
      entity_id,
      action: 'created',
      task_data: {
        title,
        status,
        priority,
        start_by: task_data.start_by,
        finish_by: task_data.finish_by,
        finished_at: task_data.finished_at
      }
    }
  }
}

// Sync tasks back to GitHub
export const sync_task_to_github = async (entity_id, repo_info) => {
  try {
    // Get task and related metadata
    const task = await db('tasks')
      .join('entities', 'tasks.entity_id', 'entities.entity_id')
      .select(
        'tasks.*',
        'entities.title',
        'entities.description',
        'entities.updated_at'
      )
      .where('tasks.entity_id', entity_id)
      .first()

    if (!task) {
      log(`Task with entity_id ${entity_id} not found`)
      return false
    }

    // Get GitHub metadata
    const metadata = await get_task_github_metadata(entity_id, repo_info)

    // Skip if not a GitHub task or not from this repo
    if (!should_sync_to_github(metadata, repo_info)) {
      return false
    }

    // Skip if GitHub was updated more recently than our task
    if (!is_task_newer_than_github(task, metadata)) {
      log(`Task ${entity_id} hasn't been updated since last GitHub sync`)
      return false
    }

    // Map task status to GitHub state
    const github_state = github.map_task_status_to_github_state(task.status)

    // Prepare update data
    const update_data = prepare_github_update_data(task, github_state)

    // Update the GitHub issue
    await github.update_github_issue({
      owner: repo_info.owner,
      repo: repo_info.repo,
      issue_number: metadata.github_issue_number,
      github_token: repo_info.github_token,
      data: update_data
    })

    // Update metadata with new timestamp
    await save_task_metadata(entity_id, {
      github_updated_at: new Date().toISOString()
    })

    log(
      `Synced task ${entity_id} to GitHub issue #${metadata.github_issue_number}`
    )
    return true
  } catch (error) {
    log(`Error syncing task to GitHub: ${error.message}`)
    return false
  }
}

// Helper function to get GitHub metadata for a task
const get_task_github_metadata = async (entity_id, repo_info) => {
  return await get_task_metadata(entity_id, [
    'github_issue_number',
    'github_repo',
    'github_updated_at',
    'external_id'
  ])
}

// Helper to decide if the task should be synced to GitHub
const should_sync_to_github = (metadata, repo_info) => {
  // Skip if not a GitHub task
  if (!metadata.external_id || !metadata.external_id.startsWith('github:')) {
    return false
  }

  // Skip if not from this repo
  const { owner, repo } = repo_info
  if (metadata.github_repo !== `${owner}/${repo}`) {
    return false
  }

  return true
}

// Helper to check if the task is newer than the GitHub issue
const is_task_newer_than_github = (task, metadata) => {
  const github_updated = new Date(metadata.github_updated_at)
  const task_updated = new Date(task.updated_at)

  return task_updated > github_updated
}

// Helper to prepare update data for GitHub
const prepare_github_update_data = (task, github_state) => {
  return {
    title: task.title,
    body: task.description,
    state: github_state
  }
}

// Process each issue for import
export const process_github_issues = async ({
  issues,
  repo_info,
  user_id,
  bidirectional = false,
  sync_existing = false,
  project_items_map = null
}) => {
  const results = {
    created: 0,
    updated: 0,
    skipped: 0,
    synced_to_github: 0,
    errors: 0,
    processed_issues: []
  }

  if (!issues || issues.length === 0) {
    log('No issues to process')
    return results
  }

  log(`Processing ${issues.length} issues`)

  for (const issue of issues) {
    try {
      // Skip pull requests
      if (issue.pull_request) {
        log(`Skipping PR #${issue.number}`)
        continue
      }

      const result = await process_single_issue({
        issue,
        repo_info,
        user_id,
        bidirectional,
        sync_existing,
        project_items_map
      })

      // Update our results
      results[result.action]++
      results.processed_issues.push(result.processed_issue)

      if (result.synced) {
        results.synced_to_github++
      }
    } catch (error) {
      log(`Error processing issue #${issue.number}: ${error.message}`)
      results.errors++
      results.processed_issues.push({
        issue_number: issue.number,
        title: issue.title,
        error: error.message
      })
    }
  }

  return results
}

// Process a single issue
const process_single_issue = async ({
  issue,
  repo_info,
  user_id,
  bidirectional,
  sync_existing,
  project_items_map
}) => {
  // Get project item if it exists
  const project_item = project_items_map
    ? project_items_map[issue.number]
    : null

  // Create or update task
  const { action, entity_id, task_data } =
    await create_or_update_task_from_github_issue({
      issue,
      repo_info,
      user_id,
      force_update: sync_existing,
      project_item
    })

  // Prepare the processed issue data
  const processed_issue = {
    issue_number: issue.number,
    title: issue.title,
    action,
    entity_id,
    task_data
  }

  // Sync back to GitHub if enabled
  let synced = false
  if (bidirectional && entity_id && action !== 'skipped') {
    synced = await sync_task_to_github(entity_id, repo_info)
  }

  return {
    action,
    processed_issue,
    synced
  }
}

// Cache handling
export const get_cached_issues = (cache_file, sync_existing) => {
  if (!cache_file || sync_existing || !fs.existsSync(cache_file)) {
    return null
  }

  try {
    const cached_data = JSON.parse(fs.readFileSync(cache_file, 'utf8'))
    const cache_time = new Date(cached_data.timestamp)
    const one_hour_ago = new Date(Date.now() - 60 * 60 * 1000)

    // Use cache if it's less than 1 hour old
    if (cache_time > one_hour_ago) {
      log(`Using cached issues from ${cache_file}`)
      return cached_data.issues
    }
  } catch (error) {
    log(`Error reading cache file: ${error.message}`)
  }

  return null
}

export const save_issues_to_cache = (cache_file, issues) => {
  if (!cache_file || issues.length === 0) {
    return
  }

  try {
    const cache_dir = path.dirname(cache_file)
    if (!fs.existsSync(cache_dir)) {
      fs.mkdirSync(cache_dir, { recursive: true })
    }

    fs.writeFileSync(
      cache_file,
      JSON.stringify({
        timestamp: new Date().toISOString(),
        issues
      })
    )
    log(`Cached ${issues.length} issues to ${cache_file}`)
  } catch (error) {
    log(`Error writing cache file: ${error.message}`)
  }
}

// Verify GitHub webhook signature
export const verify_github_signature = (req, secret) => {
  const signature = req.headers['x-hub-signature-256']

  if (!signature) {
    log('No signature header found')
    return false
  }

  if (!secret) {
    log('No webhook secret provided')
    return false
  }

  try {
    const hmac = crypto.createHmac('sha256', secret)
    const digest = 'sha256=' + hmac.update(req.raw_body).digest('hex')

    const result = crypto.timingSafeEqual(
      Buffer.from(digest),
      Buffer.from(signature)
    )

    if (!result) {
      log('Signature verification failed')
    }

    return result
  } catch (error) {
    log(`Error verifying signature: ${error.message}`)
    return false
  }
}
