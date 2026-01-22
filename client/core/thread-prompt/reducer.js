import { Record } from 'immutable'

import { thread_prompt_action_types } from './actions.js'

const DEFAULT_WORKING_DIRECTORY = 'user:'

const ThreadPromptState = new Record({
  is_open: false,
  // Thread context captured at open time - persists during navigation
  thread_id: null,
  thread_user_public_key: null,
  captured_path: null,
  // Draft state - persists during navigation while overlay is open
  draft_message: '',
  draft_cursor_position: 0,
  draft_working_directory: DEFAULT_WORKING_DIRECTORY,
  draft_should_resume: true
})

export function thread_prompt_reducer(
  state = new ThreadPromptState(),
  { payload, type }
) {
  switch (type) {
    case thread_prompt_action_types.OPEN_THREAD_PROMPT: {
      // Check if opening on a file page for initial message
      let initial_message = ''
      let initial_cursor = 0
      if (payload.file_path) {
        initial_message = `@${payload.file_path} `
        initial_cursor = initial_message.length
      }

      return state.merge({
        is_open: true,
        thread_id: payload.thread_id,
        thread_user_public_key: payload.thread_user_public_key || null,
        captured_path: payload.current_path,
        // Initialize draft state
        draft_message: initial_message,
        draft_cursor_position: initial_cursor,
        draft_working_directory: DEFAULT_WORKING_DIRECTORY,
        draft_should_resume: payload.thread_id !== null
      })
    }

    case thread_prompt_action_types.UPDATE_DRAFT:
      return state.merge(payload)

    case thread_prompt_action_types.CLOSE_THREAD_PROMPT:
      return new ThreadPromptState()

    default:
      return state
  }
}
