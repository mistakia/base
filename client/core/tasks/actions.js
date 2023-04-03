export const task_actions = {
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

export const post_user_task_request_actions = {
  failed: task_actions.postUserTaskFailed,
  pending: task_actions.postUserTaskPending,
  fulfilled: task_actions.postUserTaskFulfilled
}
