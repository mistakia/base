import { create_api_action_types, create_api_actions } from '@core/utils'

const GET_SHEET_THREAD = 'GET_SHEET_THREAD'

export const thread_sheet_action_types = {
  OPEN_THREAD_SHEET: 'OPEN_THREAD_SHEET',
  OPEN_SESSION_SHEET: 'OPEN_SESSION_SHEET',
  CLOSE_THREAD_SHEET: 'CLOSE_THREAD_SHEET',
  CLOSE_ALL_SHEETS: 'CLOSE_ALL_SHEETS',
  LOAD_SHEET_THREAD: 'LOAD_SHEET_THREAD',
  ...create_api_action_types(GET_SHEET_THREAD)
}

export const thread_sheet_actions = {
  open_thread_sheet: ({ thread_id }) => ({
    type: thread_sheet_action_types.OPEN_THREAD_SHEET,
    payload: { thread_id }
  }),

  open_session_sheet: ({ session_id }) => ({
    type: thread_sheet_action_types.OPEN_SESSION_SHEET,
    payload: { session_id }
  }),

  close_thread_sheet: (thread_id) => ({
    type: thread_sheet_action_types.CLOSE_THREAD_SHEET,
    payload: { thread_id }
  }),

  close_all_sheets: () => ({
    type: thread_sheet_action_types.CLOSE_ALL_SHEETS
  }),

  load_sheet_thread: (thread_id) => ({
    type: thread_sheet_action_types.LOAD_SHEET_THREAD,
    payload: { thread_id }
  })
}

export const get_sheet_thread_request_actions =
  create_api_actions(GET_SHEET_THREAD)
