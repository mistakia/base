import { call, fork, takeLatest } from 'redux-saga/effects'

import { get_file_history } from '@core/api/sagas'

import { file_history_action_types } from './actions.js'

export function* load_file_history_saga({ payload }) {
  const { base_uri, limit, page, before } = payload
  yield call(get_file_history, { base_uri, limit, page, before })
}

export function* watch_load_file_history() {
  yield takeLatest(
    file_history_action_types.LOAD_FILE_HISTORY,
    load_file_history_saga
  )
}

export const file_history_sagas = [fork(watch_load_file_history)]
