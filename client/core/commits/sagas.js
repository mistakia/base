import { call, fork, takeLatest } from 'redux-saga/effects'

import { get_commits, get_commit_detail } from '@core/api/sagas'

import { commits_action_types } from './actions'

export function* load_commits({ payload }) {
  const { repo_path, limit, search, author } = payload
  yield call(get_commits, { repo_path, limit, search, author })
}

export function* load_more_commits({ payload }) {
  const { repo_path, cursor } = payload
  yield call(get_commits, { repo_path, before: cursor })
}

export function* load_commit_detail_saga({ payload }) {
  const { repo_path, hash } = payload
  yield call(get_commit_detail, { repo_path, hash })
}

export function* watch_load_commits() {
  yield takeLatest(commits_action_types.LOAD_COMMITS, load_commits)
}

export function* watch_load_more_commits() {
  yield takeLatest(commits_action_types.LOAD_MORE_COMMITS, load_more_commits)
}

export function* watch_load_commit_detail() {
  yield takeLatest(
    commits_action_types.LOAD_COMMIT_DETAIL,
    load_commit_detail_saga
  )
}

export const commits_sagas = [
  fork(watch_load_commits),
  fork(watch_load_more_commits),
  fork(watch_load_commit_detail)
]
