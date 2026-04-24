export const thread_prompt_action_types = {
  OPEN_THREAD_PROMPT: 'OPEN_THREAD_PROMPT',
  CLOSE_THREAD_PROMPT: 'CLOSE_THREAD_PROMPT',
  UPDATE_DRAFT: 'UPDATE_DRAFT'
}

export const thread_prompt_actions = {
  /**
   * Open the thread prompt overlay
   * @param {Object} options
   * @param {string|null} options.thread_id - Thread ID to target (from resume button or path)
   * @param {string|null} options.file_path - File path to pre-populate as @mention
   * @param {string|null} options.current_path - Current URL path (for WorkingDirectoryPicker)
   */
  open: ({ thread_id = null, file_path = null, current_path = null } = {}) => ({
    type: thread_prompt_action_types.OPEN_THREAD_PROMPT,
    payload: {
      thread_id,
      file_path,
      current_path
    }
  }),

  close: () => ({
    type: thread_prompt_action_types.CLOSE_THREAD_PROMPT
  }),

  /**
   * Update draft state (message, cursor, working_directory_uri, should_resume)
   * @param {Object} draft - Partial draft state to merge
   */
  update_draft: (draft) => ({
    type: thread_prompt_action_types.UPDATE_DRAFT,
    payload: draft
  })
}
