import { create_api_action_types, create_api_actions } from '@core/utils'

const GET_SHEET_THREAD = 'GET_SHEET_THREAD'

export const thread_sheet_action_types = {
  OPEN_THREAD_SHEET: 'OPEN_THREAD_SHEET',
  CLOSE_THREAD_SHEET: 'CLOSE_THREAD_SHEET',
  LOAD_SHEET_THREAD: 'LOAD_SHEET_THREAD',
  ...create_api_action_types(GET_SHEET_THREAD)
}

export const thread_sheet_actions = {
  open_thread_sheet: ({ thread_id }) => ({
    type: thread_sheet_action_types.OPEN_THREAD_SHEET,
    payload: { thread_id }
  }),

  close_thread_sheet: () => ({
    type: thread_sheet_action_types.CLOSE_THREAD_SHEET
  }),

  load_sheet_thread: (thread_id) => ({
    type: thread_sheet_action_types.LOAD_SHEET_THREAD,
    payload: { thread_id }
  })
}

export const get_sheet_thread_request_actions =
  create_api_actions(GET_SHEET_THREAD)
