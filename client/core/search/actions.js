export const search_action_types = {
  OPEN_COMMAND_PALETTE: 'OPEN_COMMAND_PALETTE',
  CLOSE_COMMAND_PALETTE: 'CLOSE_COMMAND_PALETTE',
  SET_SEARCH_QUERY: 'SET_SEARCH_QUERY',
  SEARCH_REQUEST: 'SEARCH_REQUEST',
  SEARCH_SUCCESS: 'SEARCH_SUCCESS',
  SEARCH_FAILURE: 'SEARCH_FAILURE',
  CLEAR_SEARCH: 'CLEAR_SEARCH',
  CLEAR_SEARCH_RESULTS: 'CLEAR_SEARCH_RESULTS',
  SET_SELECTED_INDEX: 'SET_SELECTED_INDEX',
  FETCH_RECENT_FILES_REQUEST: 'FETCH_RECENT_FILES_REQUEST',
  FETCH_RECENT_FILES_SUCCESS: 'FETCH_RECENT_FILES_SUCCESS',
  FETCH_RECENT_FILES_FAILURE: 'FETCH_RECENT_FILES_FAILURE',
  REMOVE_CHIP: 'REMOVE_CHIP'
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

  search: ({ query, mode = 'full', types, limit, ...filters }) => ({
    type: search_action_types.SEARCH_REQUEST,
    payload: { query, mode, types, limit, ...filters }
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

  clear_results: () => ({
    type: search_action_types.CLEAR_SEARCH_RESULTS
  }),

  set_selected_index: (index) => ({
    type: search_action_types.SET_SELECTED_INDEX,
    payload: { index }
  }),

  fetch_recent_files: () => ({
    type: search_action_types.FETCH_RECENT_FILES_REQUEST
  }),

  fetch_recent_files_success: (files) => ({
    type: search_action_types.FETCH_RECENT_FILES_SUCCESS,
    payload: { files }
  }),

  fetch_recent_files_failure: (error) => ({
    type: search_action_types.FETCH_RECENT_FILES_FAILURE,
    payload: { error }
  }),

  remove_chip: (index) => ({
    type: search_action_types.REMOVE_CHIP,
    payload: { index }
  })
}
