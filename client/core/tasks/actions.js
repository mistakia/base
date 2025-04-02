import {
  create_api_actions,
  create_api_action_types
} from '../utils/actions-utils'

export const task_actions = {
  LOAD_USER_TASKS: 'LOAD_USER_TASKS',
  CREATE_USER_TASK: 'CREATE_USER_TASK',

  load_user_tasks: () => ({
    type: task_actions.LOAD_USER_TASKS
  }),

  create_user_task: ({ text_input }) => ({
    type: task_actions.CREATE_USER_TASK,
    payload: {
      text_input
    }
  }),

  ...create_api_action_types('GET_USER_TASKS'),
  ...create_api_action_types('POST_USER_TASK')
}

export const get_user_tasks_request_actions =
  create_api_actions('GET_USER_TASKS')
export const post_user_task_request_actions =
  create_api_actions('POST_USER_TASK')
