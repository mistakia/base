/* global gtag */
import { takeLatest, fork, put, call } from 'redux-saga/effects'
import FingerprintJS from '@fingerprintjs/fingerprintjs'
import { LOCATION_CHANGE, push } from 'redux-first-history'

import history from '@core/history'
import { app_actions } from './actions'
import { local_storage_adapter } from '@core/utils'

const fpPromise = FingerprintJS.load()

function save_key({ private_key, public_key }) {
  local_storage_adapter.setItem('base_private_key', private_key)
  local_storage_adapter.setItem('base_public_key', public_key)
}

export function load_from_new_keypair({ payload }) {
  const { private_key, public_key } = payload
  save_key({ private_key, public_key })
}

export function* load_from_private_key({ payload }) {
  const { private_key, public_key } = payload
  save_key({ private_key, public_key })
  yield put(push('/'))
}

// cookie-less / anonymous GA reporting
async function page_view() {
  if (!window.gtag) {
    return
  }

  const fp = await fpPromise
  const result = await fp.get()

  gtag('config', '', {
    page_path: history.location.pathname,
    client_storage: 'none',
    anonymize_ip: true,
    client_id: result.visitorId
  })
}

async function load_keys() {
  const private_key = await local_storage_adapter.getItem('base_private_key')
  const public_key = await local_storage_adapter.getItem('base_public_key')
  return { private_key, public_key }
}

export function* load() {
  const { private_key, public_key } = yield call(load_keys)
  if (private_key && public_key) {
    yield put(app_actions.load_keys({ private_key, public_key }))
  }

  yield put(app_actions.loaded())
}

export function reset() {
  window.scrollTo(0, 0)
  page_view()
}

//= ====================================
//  WATCHERS
// -------------------------------------

export function* watch_init_app() {
  yield takeLatest(app_actions.APP_LOAD, load)
}

export function* watch_location_change() {
  yield takeLatest(LOCATION_CHANGE, reset)
}

export function* watch_load_from_new_keypair() {
  yield takeLatest(app_actions.LOAD_FROM_NEW_KEYPAIR, load_from_new_keypair)
}

export function* watch_load_from_private_key() {
  yield takeLatest(app_actions.LOAD_FROM_PRIVATE_KEY, load_from_private_key)
}

//= ====================================
//  ROOT
// -------------------------------------

export const app_sagas = [
  fork(watch_init_app),
  fork(watch_location_change),
  fork(watch_load_from_new_keypair),
  fork(watch_load_from_private_key)
]
