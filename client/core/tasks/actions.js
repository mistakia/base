import { create_api_action_types, create_api_actions } from '../utils'

const POST_USER_TASK = 'POST_USER_TASK'
const GET_USER_TASKS = 'GET_USER_TASKS'
const GET_TASK = 'GET_TASK'

export const tasks_action_types = {
  ...create_api_action_types(POST_USER_TASK),
  ...create_api_action_types(GET_USER_TASKS),
  ...create_api_action_types(GET_TASK)
}

export const post_user_task_request_actions = create_api_actions(POST_USER_TASK)
export const get_user_tasks_request_actions = create_api_actions(GET_USER_TASKS)
export const get_task_request_actions = create_api_actions(GET_TASK)
