/* global AbortController, fetch */

// import queryString from 'query-string'
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
    const url = `${API_URL}/${user_id}/tasks`
    return { url }
  },
  get_user({ public_key }) {
    const url = `${API_URL}/users/public_key/${public_key}`
    return { url }
  },
  post_user({ data, signature }) {
    const url = `${API_URL}/users`
    return { url, ...POST({ data, signature }) }
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
