/* global AbortController, fetch */

// import queryString from 'query-string'
import merge from 'merge-options'

import { API_URL } from '@core/constants'

/* const POST = (data) => ({
 *   method: 'POST',
 *   body: JSON.stringify(data),
 *   headers: {
 *     'Content-Type': 'application/json'
 *   }
 * })
 *  */

export const api = {
  getUser({ user_id }) {
    const url = `${API_URL}/users/${user_id}`
    return { url }
  },
  get_tasks({ public_key }) {
    const url = `${API_URL}/${public_key}/tasks`
    return { url }
  }
}

export const apiRequest = (apiFunction, opts) => {
  const controller = new AbortController()
  const abort = controller.abort.bind(controller)
  const defaultOptions = {}
  const options = merge(defaultOptions, apiFunction(opts), {
    signal: controller.signal
  })
  const request = dispatchFetch.bind(null, options)
  return { abort, request }
}

export const dispatchFetch = async (options) => {
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
