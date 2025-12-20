export const thread_prompt_action_types = {
  OPEN_THREAD_PROMPT: 'OPEN_THREAD_PROMPT',
  CLOSE_THREAD_PROMPT: 'CLOSE_THREAD_PROMPT'
}

export const thread_prompt_actions = {
  open: ({ thread_id = null, mode = 'new' } = {}) => ({
    type: thread_prompt_action_types.OPEN_THREAD_PROMPT,
    payload: {
      thread_id,
      mode
    }
  }),

  close: () => ({
    type: thread_prompt_action_types.CLOSE_THREAD_PROMPT
  })
}
