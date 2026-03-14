import { takeLatest, fork, call } from 'redux-saga/effects'

import { get_finance_overview } from '@core/api/sagas'
import { finance_action_types } from './actions'

export function* load_finance_overview() {
  yield call(get_finance_overview)
}

export function* watch_load_finance_overview() {
  yield takeLatest(
    finance_action_types.LOAD_FINANCE_OVERVIEW,
    load_finance_overview
  )
}

export const finance_sagas = [fork(watch_load_finance_overview)]
