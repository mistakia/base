import { call, takeLatest, fork } from 'redux-saga/effects'

import { get_resource } from '@core/api/sagas'
import { resource_actions } from './actions.js'

export function* load_resource({ payload }) {
  const { base_uri, username } = payload
  yield call(get_resource, { base_uri, username })
}

//= ====================================
//  WATCHERS
// -------------------------------------

export function* watch_load_resource() {
  yield takeLatest(resource_actions.LOAD_RESOURCE, load_resource)
}

//= ====================================
//  ROOT
// -------------------------------------

export const resource_sagas = [fork(watch_load_resource)]
