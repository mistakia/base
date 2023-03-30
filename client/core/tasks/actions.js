export const task_actions = {
  GET_TASKS_FAILED: 'GET_TASKS_FAILED',
  GET_TASKS_PENDING: 'GET_TASKS_PENDING',
  GET_TASKS_FULFILLED: 'GET_TASKS_FULFILLED',

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
  })
}

export const get_tasks_request_actions = {
  failed: task_actions.getTasksFailed,
  pending: task_actions.getTasksPending,
  fulfilled: task_actions.getTasksFulfilled
}
