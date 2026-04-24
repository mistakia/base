import {
  create_api_action_types,
  create_api_actions
} from '@core/utils/actions-utils'

const GET_FILE_HISTORY = 'GET_FILE_HISTORY'

export const file_history_action_types = {
  ...create_api_action_types(GET_FILE_HISTORY),

  LOAD_FILE_HISTORY: 'LOAD_FILE_HISTORY'
}

export const get_file_history_actions = create_api_actions(GET_FILE_HISTORY)

export const file_history_actions = {
  load_file_history: ({ base_uri, limit, page, before }) => ({
    type: file_history_action_types.LOAD_FILE_HISTORY,
    payload: { base_uri, limit, page, before }
  })
}
