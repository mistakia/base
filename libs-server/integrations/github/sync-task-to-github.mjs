import debug from 'debug'

import { update_github_project_item } from './github-api/update-github-project-item.mjs'
import { update_github_issue } from './github-api/update-github-issue.mjs'
import config from '#config'

const log = debug('github:sync-task-to-github')

const TERMINAL_STATUSES = ['Completed', 'Abandoned']

/**
 * Parse a github external_id into owner, repo, and issue number.
 * Expected format: "github:owner/repo:123"
 */
function parse_github_external_id(external_id) {
  if (!external_id || !external_id.startsWith('github:')) {
    return null
  }

  const match = external_id.slice(7).match(/^(.+?)\/(.+?):(\d+)$/)
  if (!match) {
    return null
  }

  return {
    owner: match[1],
    repo: match[2],
    issue_number: parseInt(match[3], 10)
  }
}

/**
 * Resolve project config from config.github.projects using owner/repo key
 * with fallback to "default".
 */
function resolve_project_config({ owner, repo }) {
  const projects = config.github?.projects
  if (!projects || typeof projects !== 'object') {
    return null
  }

  const repo_key = `${owner}/${repo}`
  return projects[repo_key] || projects.default || null
}

/**
 * Push local status/priority changes to GitHub project fields and
 * optionally sync issue state (close/reopen).
 *
 * @param {Object} params
 * @param {Object} params.entity_properties - Full merged entity properties
 * @param {Object} params.changed_fields - Fields that changed: { status?, priority? }
 * @param {string} [params.previous_status] - Previous status value (for detecting terminal transitions)
 * @returns {Promise<Object>} { pushed_fields, skipped_reason, errors }
 */
export async function sync_task_to_github({
  entity_properties,
  changed_fields,
  previous_status
}) {
  const result = { pushed_fields: [], skipped_reason: null, errors: [] }

  try {
    const { external_id, github_project_item_id } = entity_properties

    if (!external_id || !external_id.startsWith('github:')) {
      result.skipped_reason = 'no github external_id'
      log('skipped: %s', result.skipped_reason)
      return result
    }

    if (!github_project_item_id) {
      result.skipped_reason = 'no github_project_item_id'
      log('skipped: %s', result.skipped_reason)
      return result
    }

    const github_token = config.github_access_token
    if (!github_token) {
      result.skipped_reason = 'no github_access_token configured'
      log('skipped: %s', result.skipped_reason)
      return result
    }

    const parsed = parse_github_external_id(external_id)
    if (!parsed) {
      result.skipped_reason = 'could not parse external_id'
      log('skipped: %s', result.skipped_reason)
      return result
    }

    const project_config = resolve_project_config(parsed)
    if (!project_config) {
      result.skipped_reason = 'no project config found'
      log('skipped: %s', result.skipped_reason)
      return result
    }

    // Push project field updates for status and priority
    const field_pushes = [
      {
        name: 'status',
        field_id: project_config.status_field_id,
        options: project_config.status_options
      },
      {
        name: 'priority',
        field_id: project_config.priority_field_id,
        options: project_config.priority_options
      }
    ]

    for (const { name, field_id, options } of field_pushes) {
      const value = changed_fields[name]
      if (!value) continue

      const option_id = options?.[value]
      if (!option_id) {
        log(
          'no option_id for %s "%s", skipping project field update',
          name,
          value
        )
        continue
      }

      if (!field_id) {
        log('no %s_field_id configured, skipping project field update', name)
        continue
      }

      try {
        await update_github_project_item({
          project_id: project_config.project_id,
          item_id: github_project_item_id,
          field_updates: {
            [field_id]: { singleSelectOptionId: option_id }
          },
          github_token
        })
        result.pushed_fields.push(name)
        log('pushed %s: %s -> %s', name, value, option_id)
      } catch (error) {
        result.errors.push({ field: name, message: error.message })
        log('error pushing %s: %s', name, error.message)
      }
    }

    // Sync issue state for terminal status transitions
    if (changed_fields.status) {
      const is_now_terminal = TERMINAL_STATUSES.includes(changed_fields.status)
      const was_terminal =
        previous_status && TERMINAL_STATUSES.includes(previous_status)

      if (is_now_terminal && !was_terminal) {
        try {
          await update_github_issue({
            github_repository_owner: parsed.owner,
            github_repository_name: parsed.repo,
            github_issue_number: parsed.issue_number,
            github_token,
            data: { state: 'closed' }
          })
          result.pushed_fields.push('issue_state:closed')
          log(
            'closed issue %s/%s#%d',
            parsed.owner,
            parsed.repo,
            parsed.issue_number
          )
        } catch (error) {
          result.errors.push({
            field: 'issue_state',
            message: error.message
          })
          log('error closing issue: %s', error.message)
        }
      } else if (!is_now_terminal && was_terminal) {
        try {
          await update_github_issue({
            github_repository_owner: parsed.owner,
            github_repository_name: parsed.repo,
            github_issue_number: parsed.issue_number,
            github_token,
            data: { state: 'open' }
          })
          result.pushed_fields.push('issue_state:open')
          log(
            'reopened issue %s/%s#%d',
            parsed.owner,
            parsed.repo,
            parsed.issue_number
          )
        } catch (error) {
          result.errors.push({
            field: 'issue_state',
            message: error.message
          })
          log('error reopening issue: %s', error.message)
        }
      }
    }
  } catch (error) {
    result.errors.push({ field: 'general', message: error.message })
    log('unexpected error: %s', error.message)
  }

  return result
}
