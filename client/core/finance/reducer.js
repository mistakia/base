import { Map, fromJS } from 'immutable'

import { finance_action_types } from './actions'

const initial_state = new Map({
  overview: new Map({
    net_worth: 0,
    ytd_change_pct: 0,
    asset_allocation: new Map(),
    mtd_spending: 0,
    budget_total: null,
    safe_to_spend: null,
    ytd_business_profit: 0,
    snapshot_date: null
  }),
  is_loading: false,
  error: null,
  last_fetched: null
})

export function finance_reducer(state = initial_state, action) {
  switch (action.type) {
    case finance_action_types.GET_FINANCE_OVERVIEW_PENDING:
      return state.merge({
        is_loading: true,
        error: null
      })

    case finance_action_types.GET_FINANCE_OVERVIEW_FULFILLED: {
      const { data } = action.payload
      return state.merge({
        overview: fromJS(data),
        is_loading: false,
        error: null,
        last_fetched: Date.now()
      })
    }

    case finance_action_types.GET_FINANCE_OVERVIEW_FAILED:
      return state.merge({
        is_loading: false,
        error: action.payload.error
      })

    default:
      return state
  }
}
