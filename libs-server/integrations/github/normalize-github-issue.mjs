import debug from 'debug'
import { TASK_STATUS, TASK_PRIORITY } from '#libs-shared/task-constants.mjs'
import { extract_tags_from_labels } from './github-entity-mapper.mjs'
import { extract_issue_relationships } from './extract-issue-relationships.mjs'

const log = debug('normalize-github-issue')

/**
 * Normalize GitHub issue state to lowercase for consistent comparison
 *
 * @param {Object} issue - GitHub issue object
 * @returns {string|null} Normalized state or null
 */
function get_issue_state(issue) {
  return issue?.state?.toLowerCase() || null
}

/**
 * Check if GitHub issue is closed
 *
 * @param {Object} issue - GitHub issue object
 * @returns {boolean} True if issue is closed
 */
function is_issue_closed(issue) {
  return get_issue_state(issue) === 'closed'
}

/**
 * Format status string into proper case
 *
 * @param {string} status_string - Status string to format
 * @returns {string} Formatted status
 */
export function format_status(status_string) {
  if (!status_string) return TASK_STATUS.NO_STATUS

  const status_lower = status_string.toLowerCase().trim()

  switch (status_lower) {
    case 'in progress':
    case 'in-progress':
    case 'in_progress':
      return TASK_STATUS.IN_PROGRESS
    case 'done':
    case 'completed':
      return TASK_STATUS.COMPLETED
    case 'cancelled':
    case 'canceled':
    case 'abandoned':
      return TASK_STATUS.ABANDONED
    case 'planned':
    case 'todo':
    case 'to do':
    case 'backlog':
    case 'ready':
      return TASK_STATUS.PLANNED
    case 'blocked':
      return TASK_STATUS.BLOCKED
    case 'started':
      return TASK_STATUS.STARTED
    case 'waiting':
      return TASK_STATUS.WAITING
    case 'paused':
    case 'deferred':
    case 'inactive':
      return TASK_STATUS.PAUSED
    case 'draft':
      return TASK_STATUS.DRAFT
    case 'no status':
      return TASK_STATUS.NO_STATUS
    default:
      log(
        `Unexpected status string '${status_string}' in GitHub issue normalization - this may indicate a coding gap or new GitHub status`
      )
      return TASK_STATUS.NO_STATUS
  }
}

/**
 * Format priority string into proper case
 *
 * @param {string} priority_string - Priority string to format
 * @returns {string} Formatted priority
 */
export function format_priority(priority_string) {
  if (!priority_string) return TASK_PRIORITY.NONE

  const priority_lower = priority_string.toLowerCase().trim()

  switch (priority_lower) {
    case 'critical':
    case '5 critical':
      return TASK_PRIORITY.CRITICAL
    case 'high':
    case '4 high':
      return TASK_PRIORITY.HIGH
    case 'medium':
    case '3 medium':
    case 'normal':
      return TASK_PRIORITY.MEDIUM
    case 'low':
    case '2 low':
      return TASK_PRIORITY.LOW
    case 'none':
    case '1 none':
      return TASK_PRIORITY.NONE
    default:
      log(
        `Unexpected priority string '${priority_string}' in GitHub issue normalization - this may indicate a coding gap or new GitHub priority`
      )
      return TASK_PRIORITY.NONE
  }
}

/**
 * Extract value from GitHub label by splitting on ':' or '/' and formatting
 *
 * @param {string} label_name - Label name
 * @param {Function} formatter - Formatter function (format_status or format_priority)
 * @returns {string} Extracted and formatted value
 */
function extract_value_from_label(label_name, formatter) {
  const name_lower = label_name.toLowerCase()
  let value = name_lower

  if (name_lower.includes(':')) {
    value = name_lower.split(':')[1].trim()
  } else if (name_lower.includes('/')) {
    value = name_lower.split('/')[1].trim()
  }

  return formatter(value)
}

/**
 * Find label matching the specified criteria
 *
 * @param {Object} options - Function options
 * @param {Array} options.labels - Array of labels
 * @param {Array} options.prefixes - Prefixes to match (e.g., ['status:', 'status/'])
 * @param {Array} options.exact_matches - Exact strings to match
 * @returns {Object|null} Matching label or null
 */
function find_matching_label({ labels, prefixes = [], exact_matches = [] }) {
  if (!labels || labels.length === 0) {
    return null
  }

  return labels.find((label) => {
    const label_name = label.name.toLowerCase()

    // Check for prefix matches
    const has_prefix = prefixes.some((prefix) => label_name.startsWith(prefix))

    // Check for exact matches
    const is_exact_match = exact_matches.some((match) => label_name === match)

    return has_prefix || is_exact_match
  })
}

/**
 * Map status between GitHub and internal format
 *
 * @param {Object} options - Function options
 * @param {Object} options.data - Data object (GitHub issue or internal task)
 * @param {string} options.direction - Direction of mapping (to_internal or to_external)
 * @returns {string} Mapped status
 */
export function map_status({ data, direction = 'to_internal' }) {
  if (direction === 'to_internal') {
    // Extract from GitHub
    if (is_issue_closed(data)) {
      return TASK_STATUS.COMPLETED
    }

    // Try to find status from labels
    if (data.labels && data.labels.length > 0) {
      // Look for status labels
      const status_label = find_matching_label({
        labels: data.labels,
        prefixes: ['status:', 'status/'],
        exact_matches: ['in progress', 'blocked', 'waiting', 'paused']
      })

      if (status_label) {
        return extract_value_from_label(status_label.name, format_status)
      }
    }

    // Default for open issues
    return TASK_STATUS.NO_STATUS
  } else {
    // Map to GitHub
    if (
      data.status === TASK_STATUS.COMPLETED ||
      data.status === TASK_STATUS.ABANDONED
    ) {
      return 'closed'
    } else {
      return 'open'
    }
  }
}

/**
 * Map priority between GitHub and internal format
 *
 * @param {Object} options - Function options
 * @param {Object} options.data - Data object (GitHub issue or internal task)
 * @param {string} options.direction - Direction of mapping (to_internal or to_external)
 * @returns {string|Array} Mapped priority or labels
 */
export function map_priority({ data, direction = 'to_internal' }) {
  if (direction === 'to_internal') {
    // Extract from GitHub
    if (!data.labels || data.labels.length === 0) {
      return TASK_PRIORITY.NONE
    }

    // Look for priority labels
    const priority_label = find_matching_label({
      labels: data.labels,
      prefixes: ['priority:', 'priority/'],
      exact_matches: ['high', 'medium', 'low', 'critical']
    })

    if (priority_label) {
      return extract_value_from_label(priority_label.name, format_priority)
    }

    return TASK_PRIORITY.NONE
  } else {
    // Map to GitHub labels
    if (!data.priority || data.priority === TASK_PRIORITY.NONE) {
      return []
    }

    return [`priority/${data.priority.toLowerCase()}`]
  }
}

/**
 * Field name mappings for project fields
 */
const PROJECT_FIELD_MAPPINGS = {
  status: {
    names: ['Status'],
    extractor: (field_value) =>
      field_value.name ? format_status(field_value.name) : null
  },
  priority: {
    names: ['Priority'],
    extractor: (field_value) =>
      field_value.name ? format_priority(field_value.name) : null
  },
  finish_by: {
    names: ['Due Date', 'finish_by', 'Finish By'],
    extractor: (field_value) => field_value.date || null
  },
  start_by: {
    names: ['Start Date', 'start_by', 'Start By'],
    extractor: (field_value) => field_value.date || null
  }
}

/**
 * Extract project field data from GitHub issue
 *
 * @param {Object} project_item - GitHub project item
 * @returns {Object} Extracted field values
 */
export function extract_project_fields(project_item) {
  if (!project_item?.fieldValues?.nodes) return {}

  const extracted_fields = {}
  const field_name_map = new Map()

  // Build reverse mapping: field name -> field key
  for (const [key, config] of Object.entries(PROJECT_FIELD_MAPPINGS)) {
    for (const name of config.names) {
      field_name_map.set(name.toLowerCase(), {
        key,
        extractor: config.extractor
      })
    }
  }

  // Extract fields from project item
  for (const field_value of project_item.fieldValues.nodes) {
    if (!field_value?.field?.name) continue

    const field_name_lower = field_value.field.name.toLowerCase()
    const mapping = field_name_map.get(field_name_lower)

    if (mapping) {
      const value = mapping.extractor(field_value)
      if (value) {
        extracted_fields[mapping.key] = value
      }
    }
  }

  return extracted_fields
}

/**
 * Extract tags from GitHub issue labels
 *
 * @param {Array} labels - GitHub issue labels
 * @returns {Array} Array of tags
 */
export function extract_tags_from_issue_labels(labels) {
  return extract_tags_from_labels(labels) || []
}

/**
 * Normalize GitHub issue data into consistent format
 *
 * @param {Object} options - Function options
 * @param {Object} options.issue - GitHub issue object
 * @param {string} options.external_id - External ID of the issue
 * @param {string} options.github_repository_owner - Repository owner
 * @param {string} options.github_repository_name - Repository name
 * @param {Object} options.project_item - GitHub project item (optional)
 * @param {Object} options.project_fields - Project fields (optional)
 * @param {string} options.user_public_key - User public key
 * @param {Array} [options.comments=[]] - GitHub issue comments
 * @returns {Object} Normalized issue data with github_comments field
 */
// TODO evaluate if project_item and project_fields can be consolidated
export function normalize_github_issue({
  issue,
  external_id,
  github_repository_owner,
  github_repository_name,
  project_item,
  project_fields = {},
  user_public_key,
  comments = []
}) {
  // Make sure we have an object to work with
  if (!issue) {
    throw new Error('Missing issue data for normalization')
  }

  if (!user_public_key) {
    throw new Error('Missing user public key for normalization')
  }

  // Extract basic fields
  const normalized_github_issue = {
    user_public_key,
    title: issue.title,
    description: issue.body || 'No description provided',
    status: map_status({ data: issue, direction: 'to_internal' }),
    priority: map_priority({ data: issue, direction: 'to_internal' }),
    external_id,
    external_url: issue.html_url,
    github_url: issue.html_url,
    created_at: issue.created_at,
    updated_at: issue.updated_at
  }

  // Add GitHub-specific fields
  // Handle two different ID formats:
  // - GraphQL node ID format: "I_kwDOD4Pg485mtEYT" (starts with "I_")
  // - REST API numeric ID: 1723090451 (pure number)
  if (issue.id) {
    const id_string = String(issue.id)
    if (id_string.startsWith('I_')) {
      normalized_github_issue.github_graphql_id = issue.id
      if (issue.databaseId) {
        normalized_github_issue.github_api_id = issue.databaseId
      }
    } else {
      normalized_github_issue.github_api_id = issue.id
    }
  }

  // Add optional GitHub fields
  if (issue.number) normalized_github_issue.github_number = issue.number
  if (github_repository_owner)
    normalized_github_issue.github_repository_owner = github_repository_owner
  if (github_repository_name)
    normalized_github_issue.github_repository_name = github_repository_name

  // Extract dates if issue was closed
  if (is_issue_closed(issue) && issue.closed_at) {
    normalized_github_issue.finished_at = issue.closed_at
  }

  // Process labels to extract tags
  if (issue.labels?.length > 0) {
    const extracted_tags = extract_tags_from_issue_labels(issue.labels)
    if (extracted_tags.length > 0) {
      normalized_github_issue.tags = extracted_tags
    }
  }

  // Add comments if they exist
  if (comments?.length > 0) {
    normalized_github_issue.github_comments = comments.map((comment) => ({
      author: comment.user?.login,
      date: comment.created_at,
      content: comment.body
    }))
  }

  // Override with explicit project fields if provided
  if (project_fields && Object.keys(project_fields).length > 0) {
    Object.assign(normalized_github_issue, project_fields)
  }

  // Extract fields from project item if available
  if (project_item) {
    const extracted_fields = extract_project_fields(project_item)

    // For closed issues, only allow terminal statuses from project fields
    // (COMPLETED and ABANDONED are both valid terminal states for closed issues)
    if (is_issue_closed(issue) && extracted_fields.status) {
      if (
        extracted_fields.status !== TASK_STATUS.COMPLETED &&
        extracted_fields.status !== TASK_STATUS.ABANDONED
      ) {
        log(
          `Issue #${issue.number} is closed, preserving COMPLETED status instead of project status "${extracted_fields.status}"`
        )
        delete extracted_fields.status
      }
    }

    Object.assign(normalized_github_issue, extracted_fields)

    // Add project metadata
    normalized_github_issue.github_project_item_id = project_item.id
  }

  // Extract issue relationships (parent/child and cross-references)
  const relations = extract_issue_relationships(issue)
  if (relations.length > 0) {
    normalized_github_issue.relations = relations
  }

  return normalized_github_issue
}
