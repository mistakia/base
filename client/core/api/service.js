/* global AbortController, fetch */

import qs from 'qs'
import merge from 'merge-options'

import { API_URL } from '@core/constants'

const POST = (data) => ({
  method: 'POST',
  body: JSON.stringify(data),
  headers: {
    'Content-Type': 'application/json'
  }
})

export const api = {
  get_user({ username }) {
    const url = `${API_URL}/users/${username}`
    return { url }
  },
  get_users() {
    const url = `${API_URL}/users`
    return { url }
  },
  post_user_session({ data, signature }) {
    const url = `${API_URL}/users/session`
    return { url, ...POST({ data, signature }) }
  },
  delete_user_session() {
    const url = `${API_URL}/users/session`
    return { url, method: 'DELETE' }
  },
  put_user_preferences({ preferences }) {
    const url = `${API_URL}/users/preferences`
    return {
      url,
      method: 'PUT',
      body: JSON.stringify({ preferences }),
      headers: {
        'Content-Type': 'application/json'
      }
    }
  },
  get_tasks({ limit = 100, offset = 0, ...params } = {}) {
    const url = `${API_URL}/tasks?${qs.stringify({ limit, offset, ...params })}`
    return { url }
  },
  get_available_tags({ used_by } = {}) {
    const url = `${API_URL}/tags?${qs.stringify({ used_by })}`
    return { url }
  },

  get_tag_detail({
    base_uri,
    include_threads = true,
    sort = 'updated_at',
    limit = 50
  }) {
    const params = {
      base_uri,
      include_threads: include_threads ? 'true' : 'false',
      sort,
      limit
    }
    const url = `${API_URL}/tags?${qs.stringify(params)}`
    return { url }
  },
  get_tasks_table(params) {
    const url = `${API_URL}/tasks/table`
    return { url, ...POST(params) }
  },

  get_threads({ user_public_key, thread_state, limit = 50, offset }) {
    const params = { user_public_key, thread_state, limit, offset }
    const url = `${API_URL}/threads?${qs.stringify(params)}`
    return { url }
  },

  get_threads_table(params) {
    const url = `${API_URL}/threads/table`
    return { url, ...POST(params) }
  },

  get_thread({ thread_id }) {
    const url = `${API_URL}/threads/${thread_id}`
    return { url }
  },

  get_timeline_entry({ thread_id, entry_id }) {
    const url = `${API_URL}/threads/${thread_id}/timeline/${entry_id}`
    return { url }
  },

  post_thread({ inference_provider, model, tools, thread_state }) {
    const url = `${API_URL}/threads`
    return {
      url,
      ...POST({ inference_provider, model, tools, thread_state })
    }
  },

  post_thread_message({ thread_id, content, generate_response, stream }) {
    const url = `${API_URL}/threads/${thread_id}/messages`
    return {
      url,
      ...POST({ content, generate_response, stream })
    }
  },

  put_thread_state({ thread_id, thread_state, reason, archive_reason }) {
    const url = `${API_URL}/threads/${thread_id}/state`
    const body_data = { thread_state }

    // Send archive_reason when archiving (required), reason is optional for other state changes
    if (thread_state === 'archived' && archive_reason) {
      body_data.archive_reason = archive_reason
    } else if (reason) {
      body_data.reason = reason
    }
    return {
      url,
      method: 'PUT',
      body: JSON.stringify(body_data),
      headers: {
        'Content-Type': 'application/json'
      }
    }
  },

  post_thread_execute_tool({ thread_id, tool_name, parameters }) {
    const url = `${API_URL}/threads/${thread_id}/execute-tool`
    return {
      url,
      ...POST({ tool_name, parameters })
    }
  },

  create_thread_session({ prompt, working_directory, prompt_correlation_id }) {
    const url = `${API_URL}/threads/create-session`
    return {
      url,
      ...POST({ prompt, working_directory, prompt_correlation_id })
    }
  },

  resume_thread_session({
    thread_id,
    prompt,
    working_directory,
    prompt_correlation_id
  }) {
    const url = `${API_URL}/threads/${thread_id}/resume`
    return {
      url,
      ...POST({ prompt, working_directory, prompt_correlation_id })
    }
  },

  get_models() {
    const url = `${API_URL}/models`
    return { url }
  },

  get_directories({ type, path }) {
    let url = `${API_URL}/filesystem/directory`
    if (path) {
      url += `?path=${encodeURIComponent(path)}`
    }
    return { url }
  },

  get_file_content({ type, path }) {
    const url = `${API_URL}/filesystem/file?path=${encodeURIComponent(path)}`
    return { url }
  },

  get_path_info({ path }) {
    const url = `${API_URL}/filesystem/info?path=${encodeURIComponent(path)}`
    return { url }
  },

  get_homepage_content() {
    const url = `${API_URL}/filesystem/homepage-content`
    return { url }
  },

  get_active_sessions() {
    const url = `${API_URL}/active-sessions`
    return { url }
  },

  delete_active_session({ session_id }) {
    const url = `${API_URL}/active-sessions/${session_id}`
    return { url, method: 'DELETE' }
  },

  get_activity_heatmap({ days = 365 } = {}) {
    const url = `${API_URL}/activity/heatmap?days=${days}`
    return { url }
  },

  get_task_stats() {
    const url = `${API_URL}/activity/task-stats`
    return { url }
  },

  get_entity_relations({
    base_uri,
    direction = 'both',
    relation_type,
    entity_type,
    limit = 50,
    offset = 0
  }) {
    const params = { base_uri, direction, limit, offset }
    if (relation_type) params.relation_type = relation_type
    if (entity_type) params.entity_type = entity_type
    const url = `${API_URL}/entities/relations?${qs.stringify(params)}`
    return { url }
  },

  post_entity_tags({ base_uri, tags_to_add, tags_to_remove }) {
    const url = `${API_URL}/entities/tags`
    return { url, ...POST({ base_uri, tags_to_add, tags_to_remove }) }
  },

  patch_task({ base_uri, properties }) {
    const url = `${API_URL}/tasks`
    return {
      url,
      method: 'PATCH',
      body: JSON.stringify({ base_uri, properties }),
      headers: {
        'Content-Type': 'application/json'
      }
    }
  },

  patch_entity({ base_uri, properties }) {
    const url = `${API_URL}/entities`
    return {
      url,
      method: 'PATCH',
      body: JSON.stringify({ base_uri, properties }),
      headers: {
        'Content-Type': 'application/json'
      }
    }
  },

  // Git operations
  get_git_status_all() {
    const url = `${API_URL}/git/status/all`
    return { url }
  },

  get_git_status({ repo_path }) {
    const url = `${API_URL}/git/status?repo_path=${encodeURIComponent(repo_path)}`
    return { url }
  },

  get_git_diff({ repo_path, file_path, staged }) {
    let url = `${API_URL}/git/diff?repo_path=${encodeURIComponent(repo_path)}`
    if (file_path) {
      url += `&file_path=${encodeURIComponent(file_path)}`
    }
    if (staged) {
      url += '&staged=true'
    }
    return { url }
  },

  get_file_at_ref({ repo_path, file_path, ref = 'HEAD' }) {
    let url = `${API_URL}/git/file-at-ref?repo_path=${encodeURIComponent(repo_path)}&file_path=${encodeURIComponent(file_path)}`
    if (ref && ref !== 'HEAD') {
      url += `&ref=${encodeURIComponent(ref)}`
    }
    return { url }
  },

  get_git_file_content({ repo_path, file_path }) {
    const url = `${API_URL}/git/file-content?repo_path=${encodeURIComponent(repo_path)}&file_path=${encodeURIComponent(file_path)}`
    return { url }
  },

  stage_files({ repo_path, files }) {
    const url = `${API_URL}/git/stage`
    return { url, ...POST({ repo_path, files }) }
  },

  unstage_files({ repo_path, files }) {
    const url = `${API_URL}/git/unstage`
    return { url, ...POST({ repo_path, files }) }
  },

  discard_files({ repo_path, files }) {
    const url = `${API_URL}/git/discard`
    return { url, ...POST({ repo_path, files }) }
  },

  commit_changes({ repo_path, message }) {
    const url = `${API_URL}/git/commit`
    return { url, ...POST({ repo_path, message }) }
  },

  pull_changes({ repo_path, remote, branch, stash_changes }) {
    const url = `${API_URL}/git/pull`
    return { url, ...POST({ repo_path, remote, branch, stash_changes }) }
  },

  push_changes({ repo_path, remote, branch }) {
    const url = `${API_URL}/git/push`
    return { url, ...POST({ repo_path, remote, branch }) }
  },

  get_conflicts({ repo_path }) {
    const url = `${API_URL}/git/conflicts?repo_path=${encodeURIComponent(repo_path)}`
    return { url }
  },

  resolve_conflict({ repo_path, file_path, resolution, merged_content }) {
    const url = `${API_URL}/git/resolve-conflict`
    return {
      url,
      ...POST({ repo_path, file_path, resolution, merged_content })
    }
  },

  get_conflict_versions({ repo_path, file_path }) {
    const url = `${API_URL}/git/conflict-versions?repo_path=${encodeURIComponent(repo_path)}&file_path=${encodeURIComponent(file_path)}`
    return { url }
  },

  abort_merge({ repo_path }) {
    const url = `${API_URL}/git/abort-merge`
    return { url, ...POST({ repo_path }) }
  },

  generate_commit_message({ repo_path }) {
    const url = `${API_URL}/git/generate-commit-message`
    return { url, ...POST({ repo_path }) }
  },

  get_repo_info({ path }) {
    const url = `${API_URL}/git/repo-info?path=${encodeURIComponent(path || '')}`
    return { url }
  },

  get_commits({ repo_path, limit, page, author, search }) {
    const params = {}
    if (repo_path) params.repo_path = repo_path
    if (limit) params.limit = limit
    if (page) params.page = page
    if (author) params.author = author
    if (search) params.search = search
    const url = `${API_URL}/git/commits?${qs.stringify(params)}`
    return { url }
  },

  get_commit_detail({ repo_path, hash }) {
    const params = repo_path ? `repo_path=${encodeURIComponent(repo_path)}` : ''
    const url = `${API_URL}/git/commit/${hash}?${params}`
    return { url }
  },

  get_file_history({ base_uri, limit, page, before }) {
    const params = { base_uri }
    if (limit) params.limit = limit
    if (page) params.page = page
    if (before) params.before = before
    const url = `${API_URL}/git/file-history?${qs.stringify(params)}`
    return { url }
  },

  // Search operations — source-first API. All list params are CSV strings.
  search({ q, source, type, tag, status, path_glob, scope, limit, offset }) {
    const params = { q }
    if (source) params.source = source
    if (type) params.type = type
    if (tag) params.tag = tag
    if (status) params.status = status
    if (path_glob) params.path_glob = path_glob
    if (scope) params.scope = scope
    if (limit) params.limit = limit
    if (offset) params.offset = offset
    const url = `${API_URL}/search?${qs.stringify(params)}`
    return { url }
  },

  get_recent_files({ hours, limit } = {}) {
    const query_string = qs.stringify({ hours, limit })
    const url = query_string
      ? `${API_URL}/search/recent?${query_string}`
      : `${API_URL}/search/recent`
    return { url }
  },

  get_physical_items_table(params) {
    const url = `${API_URL}/physical-items/table`
    return { url, ...POST(params) }
  },

  get_finance_overview() {
    const url = `${API_URL}/proxy/finance/dashboard/overview`
    return { url }
  }
}

export const api_request = (api_function, opts, token) => {
  const controller = new AbortController()
  const abort = controller.abort.bind(controller)
  const headers = token ? { Authorization: `Bearer ${token}` } : {}
  const default_options = { headers, credentials: 'include' }
  const options = merge(default_options, api_function(opts), {
    signal: controller.signal
  })

  // Forward share_token from page URL to API requests for shared view access
  const page_params = new URLSearchParams(window.location.search)
  const share_token = page_params.get('share_token')
  if (share_token && options.url) {
    const separator = options.url.includes('?') ? '&' : '?'
    options.url = `${options.url}${separator}share_token=${encodeURIComponent(share_token)}`
  }

  const request = dispatch_fetch.bind(null, options)
  return { abort, request }
}

export const dispatch_fetch = async (options) => {
  const response = await fetch(options.url, options)
  if (response.status >= 200 && response.status < 300) {
    return response.json()
  } else {
    const res = await response.json()
    const error = new Error(res.error || response.statusText)
    error.response = response
    error.status = response.status
    // Preserve additional error details from server response
    error.permission_denied = res.permission_denied || false
    error.denied_files = res.denied_files || null
    error.message_details = res.message || null
    throw error
  }
}
