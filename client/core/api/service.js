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
  get_tag({ tag_name, user_public_key }) {
    const url = `${API_URL}/tags/${tag_name}?user_public_key=${user_public_key}`
    return { url }
  },
  get_database({ user_public_key, database_table_name }) {
    const url = `${API_URL}/users/${user_public_key}/databases/${database_table_name}`
    return { url }
  },
  get_database_items({ user_public_key, database_table_name, ...params }) {
    const url = `${API_URL}/users/${user_public_key}/databases/${database_table_name}/items?${qs.stringify(
      params
    )}`
    return { url }
  },
  post_database_view({ user_public_key, table_name, ...params }) {
    const url = `${API_URL}/users/${user_public_key}/databases/${table_name}/views`
    return { url, ...POST(params) }
  },
  delete_database_view({ user_public_key, table_name, view_id }) {
    const url = `${API_URL}/users/${user_public_key}/databases/${table_name}/views/${view_id}`
    return { url, method: 'DELETE' }
  },
  get_tasks(params = {}) {
    const url = `${API_URL}/tasks`
    return { url }
  },
  get_tasks_table(params) {
    const url = `${API_URL}/tasks/table`
    return { url, ...POST(params) }
  },

  get_threads({ user_public_key, thread_state, limit, offset }) {
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

  post_thread({
    inference_provider,
    model,
    thread_main_request,
    tools,
    thread_state
  }) {
    const url = `${API_URL}/threads`
    return {
      url,
      ...POST({
        inference_provider,
        model,
        thread_main_request,
        tools,
        thread_state
      })
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

  create_thread_session({ prompt, working_directory }) {
    const url = `${API_URL}/threads/create-session`
    return {
      url,
      ...POST({ prompt, working_directory })
    }
  },

  resume_thread_session({ thread_id, prompt, working_directory }) {
    const url = `${API_URL}/threads/${thread_id}/resume`
    return {
      url,
      ...POST({ prompt, working_directory })
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

  stage_files({ repo_path, files }) {
    const url = `${API_URL}/git/stage`
    return { url, ...POST({ repo_path, files }) }
  },

  unstage_files({ repo_path, files }) {
    const url = `${API_URL}/git/unstage`
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

  // Search operations
  search({ q, mode = 'full', types, directory, limit }) {
    const params = { q, mode }
    if (types) params.types = types
    if (directory) params.directory = directory
    if (limit) params.limit = limit
    const url = `${API_URL}/search?${qs.stringify(params)}`
    return { url }
  },

  get_search_capabilities() {
    const url = `${API_URL}/search/capabilities`
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
