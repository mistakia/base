import { Record } from 'immutable'

import { commits_action_types } from './actions'

const CommitsState = new Record({
  commits: [],
  is_loading_commits: false,
  is_loading_more: false,
  has_more: false,
  next_cursor: null,
  repo_name: null,
  branch: null,
  commit_detail: null,
  is_loading_detail: false,
  error: null
})

export function commits_reducer(state = new CommitsState(), { payload, type }) {
  switch (type) {
    case commits_action_types.GET_COMMITS_PENDING: {
      const is_load_more = payload?.opts?.before
      if (is_load_more) {
        return state.merge({
          is_loading_more: true,
          error: null
        })
      }
      return state.merge({
        is_loading_commits: true,
        error: null
      })
    }

    case commits_action_types.GET_COMMITS_FULFILLED: {
      const { commits, has_more, next_cursor, repo_name, branch } =
        payload.data
      const is_load_more = payload?.opts?.before

      if (is_load_more) {
        return state.merge({
          commits: [...state.get('commits'), ...commits],
          is_loading_more: false,
          has_more,
          next_cursor
        })
      }

      return state.merge({
        commits,
        is_loading_commits: false,
        is_loading_more: false,
        has_more,
        next_cursor,
        repo_name,
        branch
      })
    }

    case commits_action_types.GET_COMMITS_FAILED:
      return state.merge({
        is_loading_commits: false,
        is_loading_more: false,
        error: payload.error
      })

    case commits_action_types.GET_COMMIT_DETAIL_PENDING:
      return state.merge({
        is_loading_detail: true
      })

    case commits_action_types.GET_COMMIT_DETAIL_FULFILLED:
      return state.merge({
        commit_detail: payload.data,
        is_loading_detail: false
      })

    case commits_action_types.GET_COMMIT_DETAIL_FAILED:
      return state.merge({
        is_loading_detail: false,
        error: payload.error
      })

    default:
      return state
  }
}
