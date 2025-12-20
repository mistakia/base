import { Record } from 'immutable'

import { thread_prompt_action_types } from './actions.js'

const ThreadPromptState = new Record({
  is_open: false,
  target_thread_id: null,
  initial_mode: 'new'
})

export function thread_prompt_reducer(
  state = new ThreadPromptState(),
  { payload, type }
) {
  switch (type) {
    case thread_prompt_action_types.OPEN_THREAD_PROMPT:
      return state.merge({
        is_open: true,
        target_thread_id: payload.thread_id,
        initial_mode: payload.mode
      })

    case thread_prompt_action_types.CLOSE_THREAD_PROMPT:
      return new ThreadPromptState()

    default:
      return state
  }
}
