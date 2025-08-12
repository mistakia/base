import { takeLatest, fork, put, select, call } from 'redux-saga/effects'
import { LOCATION_CHANGE, push } from 'redux-first-history'
import Ed25519 from 'nanocurrency-web/dist/lib/ed25519'
import Convert from 'nanocurrency-web/dist/lib/util/convert'
import { blake2b } from 'blakejs'

import { app_actions } from './actions'
import { get_app } from './selectors'
import { local_storage_adapter } from '@core/utils'
import { post_user_session } from '@core/api'

function save_key({ user_private_key, user_public_key }) {
  local_storage_adapter.setItem('base_private_key', user_private_key)
  local_storage_adapter.setItem('base_public_key', user_public_key)
}

function* establish_user_session() {
  const { user_private_key, user_public_key } = yield select(get_app)
  if (!user_private_key || !user_public_key) {
    return
  }

  const timestamp = Date.now()
  const data = { timestamp, user_public_key }
  const hash = blake2b(JSON.stringify(data), null, 32)
  const signature = new Ed25519().sign(hash, Convert.hex2ab(user_private_key))
  yield call(post_user_session, { data, signature: Convert.ab2hex(signature) })
}

export function* load_from_new_keypair({ payload }) {
  const { user_private_key, user_public_key } = payload
  save_key({ user_private_key, user_public_key })
  yield call(establish_user_session)
}

export function* load_from_private_key({ payload }) {
  const { user_private_key, user_public_key } = payload
  save_key({ user_private_key, user_public_key })
  yield put(push('/'))
  yield call(establish_user_session)
}

async function load_keys() {
  const user_private_key =
    await local_storage_adapter.getItem('base_private_key')
  const user_public_key = await local_storage_adapter.getItem('base_public_key')
  return { user_private_key, user_public_key }
}

export function* load() {
  yield put(app_actions.loaded())
}

export function reset() {
  window.scrollTo(0, 0)
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

//= ====================================
//  ROOT
// -------------------------------------

export const app_sagas = [
  fork(watch_init_app),
  fork(watch_location_change),
  fork(watch_load_from_new_keypair),
  fork(watch_load_from_private_key),
  fork(watch_post_user_session_fulfilled)
]
