import { Record } from 'immutable'

import { file_history_action_types } from './actions.js'

const FileHistoryState = new Record({
  commits: [],
  is_loading: false,
  page: 1,
  per_page: 50,
  total_count: 0,
  total_pages: 1,
  count_capped: false,
  repo_name: null,
  branch: null,
  base_uri: null,
  current_path: null,
  error: null
})

export function file_history_reducer(
  state = new FileHistoryState(),
  { payload, type }
) {
  switch (type) {
    case file_history_action_types.GET_FILE_HISTORY_PENDING:
      return state.merge({
        is_loading: true,
        error: null
      })

    case file_history_action_types.GET_FILE_HISTORY_FULFILLED: {
      const {
        commits,
        total_count,
        total_pages,
        count_capped,
        page,
        per_page,
        repo_name,
        branch,
        base_uri,
        current_path
      } = payload.data

      return state.merge({
        commits,
        is_loading: false,
        total_count: total_count ?? 0,
        total_pages: total_pages ?? 1,
        count_capped: Boolean(count_capped),
        page,
        per_page,
        repo_name,
        branch,
        base_uri,
        current_path
      })
    }

    case file_history_action_types.GET_FILE_HISTORY_FAILED:
      return state.merge({
        is_loading: false,
        error: payload.error
      })

    default:
      return state
  }
}
