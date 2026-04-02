import { takeLatest, fork, put, select, call } from 'redux-saga/effects'
import { LOCATION_CHANGE } from 'redux-first-history'
import Ed25519 from 'nanocurrency-web/dist/lib/ed25519'
import Convert from 'nanocurrency-web/dist/lib/util/convert'
import { blake2b } from 'blakejs'

import { app_actions } from './actions'
import { get_app } from './selectors'
import { local_storage_adapter } from '@core/utils'
import { post_user_session } from '@core/api'
import { api, dispatch_fetch } from '@core/api/service'
import { directory_actions } from '@core/directory/actions'
import { threads_actions } from '@core/threads/actions'
import { tasks_actions } from '@core/tasks/actions'

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
  const nonce = crypto.randomUUID()
  const data = { timestamp, user_public_key, nonce }
  const hash = blake2b(JSON.stringify(data), null, 32)
  const signature = new Ed25519().sign(hash, Convert.hex2ab(user_private_key))
  yield call(post_user_session, { data, signature: Convert.ab2hex(signature) })
}

export function* load_from_private_key({ payload }) {
  const { user_private_key, user_public_key } = payload
  save_key({ user_private_key, user_public_key })
  yield call(establish_user_session)
}

async function load_keys() {
  const user_private_key =
    await local_storage_adapter.getItem('base_private_key')
  const user_public_key = await local_storage_adapter.getItem('base_public_key')
  const user_token = await local_storage_adapter.getItem('base_token')
  return { user_private_key, user_public_key, user_token }
}

export function* load() {
  // Load stored authentication keys on app initialization
  const { user_private_key, user_public_key, user_token } =
    yield call(load_keys)

  if (user_private_key && user_public_key) {
    yield put(
      app_actions.load_keys({ user_private_key, user_public_key, user_token })
    )

    // Always establish session to get user data (username, etc.)
    // Even if we have a stored token, we need to fetch the user info
    yield call(establish_user_session)
  } else if (user_token) {
    // If no keys but token exists, still load the token
    yield put(
      app_actions.load_keys({
        user_private_key: null,
        user_public_key: null,
        user_token
      })
    )
  }

  yield put(app_actions.loaded())
}

export function reset() {
  window.scrollTo(0, 0)
}

export function save_token({ payload }) {
  const { token } = payload.data
  local_storage_adapter.setItem('base_token', token)
}

function* handle_post_user_session_fulfilled({ payload }) {
  save_token({ payload })
  yield call(handle_page_refresh_after_session_success)
}

function* update_user_preference({ payload }) {
  const { key, value } = payload
  try {
    yield call(dispatch_fetch, api.put_user_preferences({
      preferences: { [key]: value }
    }))
  } catch (err) {
    console.warn('Failed to update preference:', err.message)
  }
}

export function* clear_auth() {
  // Clear server-side cookie before clearing local storage
  try {
    yield call(dispatch_fetch, api.delete_user_session())
  } catch (err) {
    console.warn('Failed to clear server session:', err.message)
  }

  yield call(async () => {
    await local_storage_adapter.removeItem('base_private_key')
    await local_storage_adapter.removeItem('base_public_key')
    await local_storage_adapter.removeItem('base_token')
  })
}

function* handle_page_refresh_after_session_success() {
  try {
    const router = yield select((state) => state.get('router'))
    const pathname = router.location.pathname

    switch (true) {
      case pathname === '/':
        yield put(directory_actions.load_path_info())
        yield put(threads_actions.load_threads())
        break

      case pathname === '/thread':
        yield put(threads_actions.load_threads())
        break

      case pathname.startsWith('/thread/'): {
        const threadId = pathname.split('/')[2]
        // Only load individual thread data for UUID paths; view slugs
        // (e.g. /thread/active, /thread/default) are handled by ThreadsPage
        if (
          threadId &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            threadId
          )
        ) {
          yield put(threads_actions.load_thread(threadId))
        }
        break
      }

      case pathname === '/task':
        yield put(tasks_actions.load_tasks_table())
        break

      default:
        // FileSystemBrowser's useFileSystemData hook handles initial path loading.
        // No need to re-dispatch load_path_info here - it would cause redundant
        // API calls since the component already loaded the data on mount.
        break
    }
  } catch (error) {
    console.error('Error refreshing page after session success:', error)
  }
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

export function* watch_load_from_private_key() {
  yield takeLatest(app_actions.LOAD_FROM_PRIVATE_KEY, load_from_private_key)
}

export function* watch_post_user_session_fulfilled() {
  yield takeLatest(
    app_actions.POST_USER_SESSION_FULFILLED,
    handle_post_user_session_fulfilled
  )
}

export function* watch_clear_auth() {
  yield takeLatest(app_actions.CLEAR_AUTH, clear_auth)
}

export function* watch_set_user_preference() {
  yield takeLatest(app_actions.SET_USER_PREFERENCE, update_user_preference)
}

//= ====================================
//  ROOT
// -------------------------------------

export const app_sagas = [
  fork(watch_init_app),
  fork(watch_location_change),
  fork(watch_load_from_private_key),
  fork(watch_post_user_session_fulfilled),
  fork(watch_clear_auth),
  fork(watch_set_user_preference)
]
