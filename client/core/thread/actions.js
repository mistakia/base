import { create_api_action_types, create_api_actions } from '../utils'

const POST_THREAD = 'POST_THREAD'
const GET_THREADS = 'GET_THREADS'
const GET_THREAD = 'GET_THREAD'
const POST_THREAD_MESSAGE = 'POST_THREAD_MESSAGE'
const PUT_THREAD_STATE = 'PUT_THREAD_STATE'
const POST_THREAD_TOOL = 'POST_THREAD_TOOL'

export const thread_action_types = {
  ...create_api_action_types(POST_THREAD),
  ...create_api_action_types(GET_THREADS),
  ...create_api_action_types(GET_THREAD),
  ...create_api_action_types(POST_THREAD_MESSAGE),
  ...create_api_action_types(PUT_THREAD_STATE),
  ...create_api_action_types(POST_THREAD_TOOL)
}

export const post_thread_request_actions = create_api_actions(POST_THREAD)
export const get_threads_request_actions = create_api_actions(GET_THREADS)
export const get_thread_request_actions = create_api_actions(GET_THREAD)
export const post_thread_message_request_actions =
  create_api_actions(POST_THREAD_MESSAGE)
export const put_thread_state_request_actions =
  create_api_actions(PUT_THREAD_STATE)
export const post_thread_tool_request_actions =
  create_api_actions(POST_THREAD_TOOL)
