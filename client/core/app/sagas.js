/* global gtag */
import { takeLatest, fork, put } from 'redux-saga/effects'
import FingerprintJS from '@fingerprintjs/fingerprintjs'
import { LOCATION_CHANGE } from 'redux-first-history'

import history from '@core/history'
import { app_actions } from './actions'

const fpPromise = FingerprintJS.load()

// cookie-less / anonymous GA reporting
async function pageView() {
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

export function* load() {
  // do stuff
  yield put(app_actions.loaded())
}

export function reset() {
  window.scrollTo(0, 0)
  pageView()
}

//= ====================================
//  WATCHERS
// -------------------------------------

export function* watchInitApp() {
  yield takeLatest(app_actions.APP_LOAD, load)
}

export function* watchLocationChange() {
  yield takeLatest(LOCATION_CHANGE, reset)
}

//= ====================================
//  ROOT
// -------------------------------------

export const app_sagas = [fork(watchInitApp)]
