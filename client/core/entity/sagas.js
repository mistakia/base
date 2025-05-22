import { call, takeLatest, fork, select } from 'redux-saga/effects'

import { get_entity } from '@core/api/sagas'
import { entity_actions } from './actions'

export function* load_entity({ payload }) {
  const { base_relative_path, root_base_directory } = payload
  yield call(get_entity, { base_relative_path, root_base_directory })
}

//= ====================================
//  WATCHERS
// -------------------------------------

export function* watch_load_entity() {
  yield takeLatest(entity_actions.LOAD_ENTITY, load_entity)
}

//= ====================================
//  ROOT
// -------------------------------------

export const entity_sagas = [fork(watch_load_entity)]
