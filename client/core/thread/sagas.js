import {
  call,
  takeLatest,
  takeEvery,
  put,
  fork,
  select
} from 'redux-saga/effects'
import { push } from 'redux-first-history'

import { get_app } from '@core/app'
import {
  get_threads,
  get_thread,
  post_thread,
  post_thread_message,
  put_thread_state,
  post_thread_execute_tool,
  get_inference_providers
} from '@core/api'
import { thread_actions } from './actions'

//= ====================================
//  SAGAS
// -------------------------------------

export function* load_threads() {
  const { user_id } = yield select(get_app)
  yield call(get_threads, { user_id })
}

export function* load_thread({ payload }) {
  const { user_id } = yield select(get_app)
  const { thread_id } = payload
  yield call(get_thread, { thread_id, user_id })
}

export function* load_inference_providers() {
  const { user_id } = yield select(get_app)
  yield call(get_inference_providers, { user_id })
}

export function* create_thread({ payload }) {
  const { user_id } = yield select(get_app)
  const { inference_provider, model, thread_main_request, tools } = payload
  yield call(post_thread, {
    inference_provider,
    model,
    thread_main_request,
    tools,
    user_id
  })
}

// Handle thread creation success
export function* handle_thread_created({ payload }) {
  const { data } = payload
  if (data && data.thread_id) {
    yield put(push(`/threads/${data.thread_id}`))
  }
}

export function* add_message({ payload }) {
  const { user_id } = yield select(get_app)
  const { stream, ...message_data } = payload

  yield call(post_thread_message, {
    ...message_data,
    user_id,
    stream: Boolean(stream)
  })
}

export function* update_thread_state({ payload }) {
  const { user_id } = yield select(get_app)
  yield call(put_thread_state, { ...payload, user_id })
}

export function* execute_tool({ payload }) {
  const { user_id } = yield select(get_app)
  yield call(post_thread_execute_tool, { ...payload, user_id })
}

//= ====================================
//  WATCHERS
// -------------------------------------

function* watch_load_threads() {
  yield takeLatest(thread_actions.LOAD_THREADS, load_threads)
}

function* watch_load_thread() {
  yield takeLatest(thread_actions.LOAD_THREAD, load_thread)
}

function* watch_load_inference_providers() {
  yield takeLatest(
    thread_actions.LOAD_INFERENCE_PROVIDERS,
    load_inference_providers
  )
}

function* watch_create_thread() {
  yield takeLatest(thread_actions.CREATE_THREAD, create_thread)
}

function* watch_thread_created() {
  yield takeLatest(thread_actions.POST_THREAD_FULFILLED, handle_thread_created)
}

function* watch_add_message() {
  yield takeEvery(thread_actions.ADD_MESSAGE, add_message)
}

function* watch_update_thread_state() {
  yield takeEvery(thread_actions.UPDATE_THREAD_STATE, update_thread_state)
}

function* watch_execute_tool() {
  yield takeEvery(thread_actions.EXECUTE_TOOL, execute_tool)
}

//= ====================================
//  ROOT
// -------------------------------------

export const thread_sagas = [
  fork(watch_load_threads),
  fork(watch_load_thread),
  fork(watch_load_inference_providers),
  fork(watch_create_thread),
  fork(watch_thread_created),
  fork(watch_add_message),
  fork(watch_update_thread_state),
  fork(watch_execute_tool)
]
