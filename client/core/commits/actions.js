import {
  create_api_action_types,
  create_api_actions
} from '@core/utils/actions-utils'

const GET_COMMITS = 'GET_COMMITS'
const GET_COMMIT_DETAIL = 'GET_COMMIT_DETAIL'

export const commits_action_types = {
  ...create_api_action_types(GET_COMMITS),
  ...create_api_action_types(GET_COMMIT_DETAIL),

  LOAD_COMMITS: 'LOAD_COMMITS',
  LOAD_MORE_COMMITS: 'LOAD_MORE_COMMITS',
  LOAD_COMMIT_DETAIL: 'LOAD_COMMIT_DETAIL'
}

export const get_commits_actions = create_api_actions(GET_COMMITS)
export const get_commit_detail_actions = create_api_actions(GET_COMMIT_DETAIL)

export const commits_actions = {
  load_commits: ({ repo_path, limit, search, author }) => ({
    type: commits_action_types.LOAD_COMMITS,
    payload: { repo_path, limit, search, author }
  }),

  load_more_commits: ({ repo_path, cursor }) => ({
    type: commits_action_types.LOAD_MORE_COMMITS,
    payload: { repo_path, cursor }
  }),

  load_commit_detail: ({ repo_path, hash }) => ({
    type: commits_action_types.LOAD_COMMIT_DETAIL,
    payload: { repo_path, hash }
  })
}
