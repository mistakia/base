export const search_action_types = {
  OPEN_COMMAND_PALETTE: 'OPEN_COMMAND_PALETTE',
  CLOSE_COMMAND_PALETTE: 'CLOSE_COMMAND_PALETTE',
  SET_SEARCH_QUERY: 'SET_SEARCH_QUERY',
  SEARCH_REQUEST: 'SEARCH_REQUEST',
  SEARCH_SUCCESS: 'SEARCH_SUCCESS',
  SEARCH_FAILURE: 'SEARCH_FAILURE',
  CLEAR_SEARCH: 'CLEAR_SEARCH',
  SET_SELECTED_INDEX: 'SET_SELECTED_INDEX'
}

export const search_actions = {
  open: () => ({
    type: search_action_types.OPEN_COMMAND_PALETTE
  }),

  close: () => ({
    type: search_action_types.CLOSE_COMMAND_PALETTE
  }),

  set_query: (query) => ({
    type: search_action_types.SET_SEARCH_QUERY,
    payload: { query }
  }),

  search: ({ query, mode = 'full', types, limit }) => ({
    type: search_action_types.SEARCH_REQUEST,
    payload: { query, mode, types, limit }
  }),

  search_success: (results) => ({
    type: search_action_types.SEARCH_SUCCESS,
    payload: { results }
  }),

  search_failure: (error) => ({
    type: search_action_types.SEARCH_FAILURE,
    payload: { error }
  }),

  clear: () => ({
    type: search_action_types.CLEAR_SEARCH
  }),

  set_selected_index: (index) => ({
    type: search_action_types.SET_SELECTED_INDEX,
    payload: { index }
  })
}
