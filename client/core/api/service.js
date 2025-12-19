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
    throw error
  }
}
