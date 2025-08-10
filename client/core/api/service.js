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
  post_user_task({ public_key, task, signature }) {
    const url = `${API_URL}/users/${public_key}/tasks`
    return { url, ...POST({ task, signature }) }
  },
  get_tag({ tag_name, user_id }) {
    const url = `${API_URL}/tags/${tag_name}?user_id=${user_id}`
    return { url }
  },
  get_database({ user_id, database_table_name }) {
    const url = `${API_URL}/users/${user_id}/databases/${database_table_name}`
    return { url }
  },
  get_database_items({ user_id, database_table_name, ...params }) {
    const url = `${API_URL}/users/${user_id}/databases/${database_table_name}/items?${qs.stringify(
      params
    )}`
    return { url }
  },
  post_database_view({ user_id, table_name, ...params }) {
    const url = `${API_URL}/users/${user_id}/databases/${table_name}/views`
    return { url, ...POST(params) }
  },
  delete_database_view({ user_id, table_name, view_id }) {
    const url = `${API_URL}/users/${user_id}/databases/${table_name}/views/${view_id}`
    return { url, method: 'DELETE' }
  },
  get_user_tasks({ user_id }) {
    const url = `${API_URL}/users/${user_id}/tasks`
    return { url }
  },
  get_task({ task_id, user_id }) {
    const url = `${API_URL}/users/${user_id}/tasks/${task_id}`
    return { url }
  },

  get_entity({ base_uri, root_base_directory }) {
    const params = { root_base_directory }
    const url = `${API_URL}/entities/${encodeURIComponent(base_uri)}?${qs.stringify(params)}`
    return { url }
  },

  get_threads({ user_id, thread_state, limit, offset }) {
    const params = { user_id, thread_state, limit, offset }
    const url = `${API_URL}/threads?${qs.stringify(params)}`
    return { url }
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

  put_thread_state({ thread_id, thread_state, reason }) {
    const url = `${API_URL}/threads/${thread_id}/state`
    return {
      url,
      method: 'PUT',
      body: JSON.stringify({ thread_state, reason }),
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

  get_inference_providers() {
    const url = `${API_URL}/inference-providers`
    return { url }
  },

  get_directories({ type, path }) {
    let url = `${API_URL}/directories?type=${type}`
    if (path) {
      url += `&path=${encodeURIComponent(path)}`
    }
    return { url }
  },

  get_file_content({ type, path }) {
    const url = `${API_URL}/directories/file?type=${type}&path=${encodeURIComponent(path)}`
    return { url }
  },

  get_resource({ base_uri, username }) {
    const url = `${API_URL}/resource?base_uri=${encodeURIComponent(base_uri)}&username=${encodeURIComponent(username)}`
    return { url }
  }
}

export const api_request = (api_function, opts, token) => {
  const controller = new AbortController()
  const abort = controller.abort.bind(controller)
  const headers = { Authorization: `Bearer ${token}` }
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
