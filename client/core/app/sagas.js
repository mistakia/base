/* global gtag */
import { takeLatest, fork, put, call, select } from 'redux-saga/effects'
import FingerprintJS from '@fingerprintjs/fingerprintjs'
import { LOCATION_CHANGE, push } from 'redux-first-history'
import Ed25519 from 'nanocurrency-web/dist/lib/ed25519'
import Convert from 'nanocurrency-web/dist/lib/util/convert'
import { blake2b } from 'blakejs'

import history from '@core/history'
import { app_actions } from './actions'
import { get_app } from './selectors'
import { local_storage_adapter } from '@core/utils'
import { post_user, post_user_session } from '@core/api'

const fpPromise = FingerprintJS.load()

function save_key({ private_key, public_key }) {
  local_storage_adapter.setItem('base_private_key', private_key)
  local_storage_adapter.setItem('base_public_key', public_key)
}

function* establish_user_session() {
  const { private_key, public_key } = yield select(get_app)
  if (!private_key || !public_key) {
    return
  }

  const timestamp = Date.now()
  const data = { timestamp, public_key }
  const hash = blake2b(JSON.stringify(data), null, 32)
  const signature = new Ed25519().sign(hash, Convert.hex2ab(private_key))
  yield call(post_user_session, { data, signature: Convert.ab2hex(signature) })
}

export function* load_from_new_keypair({ payload }) {
  const { private_key, public_key } = payload
  save_key({ private_key, public_key })
  yield call(establish_user_session)
}

export function* load_from_private_key({ payload }) {
  const { private_key, public_key } = payload
  save_key({ private_key, public_key })
  yield put(push('/'))
  yield call(establish_user_session)
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
    yield call(establish_user_session)
  }

  yield put(app_actions.loaded())
}

export function reset() {
  window.scrollTo(0, 0)
  page_view()
}

export function* create_user({ payload }) {
  const { private_key, public_key } = yield select(get_app)
  const { error } = payload

  // if we have a private key and no user data was returned, create a new user
  if (error === 'Error: user not found' && private_key) {
    const data = {
      public_key
    }
    const hash = blake2b(JSON.stringify(data), null, 32)
    const signature = new Ed25519().sign(hash, Convert.hex2ab(private_key))
    yield call(post_user, { data, signature: Convert.ab2hex(signature) })
  }
}

export function save_token({ payload }) {
  const { token } = payload.data
  local_storage_adapter.setItem('base_token', token)
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

export function* watch_post_user_session_fulfilled() {
  yield takeLatest(app_actions.POST_USER_SESSION_FULFILLED, save_token)
}

export function* watch_post_user_session_failed() {
  yield takeLatest(app_actions.POST_USER_SESSION_FAILED, create_user)
}

export function* watch_post_user_fulfilled() {
  yield takeLatest(app_actions.POST_USER_FULFILLED, save_token)
}

//= ====================================
//  ROOT
// -------------------------------------

export const app_sagas = [
  fork(watch_init_app),
  fork(watch_location_change),
  fork(watch_load_from_new_keypair),
  fork(watch_load_from_private_key),
  fork(watch_post_user_session_fulfilled),
  fork(watch_post_user_session_failed),
  fork(watch_post_user_fulfilled)
]
