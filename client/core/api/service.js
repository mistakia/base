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
  get_tasks({ user_id }) {
    const url = `${API_URL}/users/${user_id}/tasks`
    return { url }
  },
  get_user({ username }) {
    const url = `${API_URL}/users/${username}`
    return { url }
  },
  post_user({ data, signature }) {
    const url = `${API_URL}/users`
    return { url, ...POST({ data, signature }) }
  },
  post_user_session({ data, signature }) {
    const url = `${API_URL}/users/session`
    return { url, ...POST({ data, signature }) }
  },
  post_user_task({ user_id, task, signature }) {
    const url = `${API_URL}/users/${user_id}/tasks`
    return { url, ...POST({ task, signature }) }
  },
  get_path_views({ folder_path, user_id }) {
    const url = `${API_URL}/users/${user_id}/views?folder_path=${folder_path}`
    return { url }
  },
  get_folder_path({ folder_path }) {
    const url = `${API_URL}/folders${folder_path}`
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
  }
}

export const api_request = (apiFunction, opts) => {
  const controller = new AbortController()
  const abort = controller.abort.bind(controller)
  const defaultOptions = {}
  const options = merge(defaultOptions, apiFunction(opts), {
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
