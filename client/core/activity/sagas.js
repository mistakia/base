import { takeLatest, fork, call } from 'redux-saga/effects'

import { get_activity_heatmap } from '@core/api/sagas'
import { activity_action_types } from './actions'

export function* load_activity_heatmap({ payload }) {
  yield call(get_activity_heatmap, payload)
}

export function* watch_load_activity_heatmap() {
  yield takeLatest(
    activity_action_types.LOAD_ACTIVITY_HEATMAP,
    load_activity_heatmap
  )
}

export const activity_sagas = [fork(watch_load_activity_heatmap)]
