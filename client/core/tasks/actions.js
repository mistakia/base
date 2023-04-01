export const task_actions = {
  GET_TASKS_FAILED: 'GET_TASKS_FAILED',
  GET_TASKS_PENDING: 'GET_TASKS_PENDING',
  GET_TASKS_FULFILLED: 'GET_TASKS_FULFILLED',

  POST_USER_TASK_FAILED: 'POST_USER_TASK_FAILED',
  POST_USER_TASK_PENDING: 'POST_USER_TASK_PENDING',
  POST_USER_TASK_FULFILLED: 'POST_USER_TASK_FULFILLED',

  LOAD_USER_TASKS: 'LOAD_USER_TASKS',
  CREATE_USER_TASK: 'CREATE_USER_TASK',

  create_user_task: ({ text_input }) => ({
    type: task_actions.CREATE_USER_TASK,
    payload: {
      text_input
    }
  }),

  load_user_tasks: ({ user_id }) => ({
    type: task_actions.LOAD_USER_TASKS,
    payload: {
      user_id
    }
  }),

  getTasksPending: (opts) => ({
    type: task_actions.GET_TASKS_PENDING,
    payload: {
      opts
    }
  }),

  getTasksFulfilled: (opts, data) => ({
    type: task_actions.GET_TASKS_FULFILLED,
    payload: {
      opts,
      data
    }
  }),

  getTasksFailed: (opts, error) => ({
    type: task_actions.GET_TASKS_FAILED,
    payload: {
      opts,
      error
    }
  }),

  postUserTaskPending: (opts) => ({
    type: task_actions.POST_USER_TASK_PENDING,
    payload: {
      opts
    }
  }),

  postUserTaskFulfilled: (opts, data) => ({
    type: task_actions.POST_USER_TASK_FULFILLED,
    payload: {
      opts,
      data
    }
  }),

  postUserTaskFailed: (opts, error) => ({
    type: task_actions.POST_USER_TASK_FAILED,
    payload: {
      opts,
      error
    }
  })
}

export const get_tasks_request_actions = {
  failed: task_actions.getTasksFailed,
  pending: task_actions.getTasksPending,
  fulfilled: task_actions.getTasksFulfilled
}

export const post_user_task_request_actions = {
  failed: task_actions.postUserTaskFailed,
  pending: task_actions.postUserTaskPending,
  fulfilled: task_actions.postUserTaskFulfilled
}
