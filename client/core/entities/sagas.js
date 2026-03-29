import { takeLatest, fork, call, put } from 'redux-saga/effects'

import { patch_entity } from '@core/api/sagas'
import { entity_action_types, entity_actions } from './actions'

export function* update_entity_property({ payload }) {
  const { base_uri, property_name, value, previous_value } = payload

  yield call(patch_entity, {
    base_uri,
    properties: { [property_name]: value },
    property_name,
    previous_value
  })
}

export function* handle_patch_entity_failed({ payload }) {
  const { opts } = payload
  const { base_uri, property_name, previous_value } = opts || {}

  if (previous_value !== undefined && base_uri && property_name) {
    yield put(
      entity_actions.revert_entity_update({
        base_uri,
        property_name,
        previous_value
      })
    )
  }
}

//= ====================================
//  WATCHERS
// -------------------------------------

export function* watch_update_entity_property() {
  yield takeLatest(
    entity_action_types.UPDATE_ENTITY_PROPERTY,
    update_entity_property
  )
}

export function* watch_patch_entity_failed() {
  yield takeLatest(
    entity_action_types.PATCH_ENTITY_FAILED,
    handle_patch_entity_failed
  )
}

//= ====================================
//  ROOT
// -------------------------------------

export const entity_sagas = [
  fork(watch_update_entity_property),
  fork(watch_patch_entity_failed)
]
