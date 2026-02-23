import { call, fork, takeLatest } from 'redux-saga/effects'

import { get_commits, get_commit_detail } from '@core/api/sagas'

import { commits_action_types } from './actions'

export function* load_commits({ payload }) {
  const { repo_path, limit, page, search, author } = payload
  yield call(get_commits, { repo_path, limit, page, search, author })
}

export function* load_commit_detail_saga({ payload }) {
  const { repo_path, hash } = payload
  yield call(get_commit_detail, { repo_path, hash })
}

export function* watch_load_commits() {
  yield takeLatest(commits_action_types.LOAD_COMMITS, load_commits)
}

export function* watch_load_commit_detail() {
  yield takeLatest(
    commits_action_types.LOAD_COMMIT_DETAIL,
    load_commit_detail_saga
  )
}

export const commits_sagas = [
  fork(watch_load_commits),
  fork(watch_load_commit_detail)
]
