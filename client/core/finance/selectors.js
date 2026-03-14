import { createSelector } from 'reselect'

export function get_finance_state(state) {
  return state.get('finance')
}

export function get_finance_overview(state) {
  return get_finance_state(state).get('overview')
}

export function get_finance_is_loading(state) {
  return get_finance_state(state).get('is_loading')
}

export const get_finance_net_worth = createSelector(
  [get_finance_overview],
  (overview) => overview.get('net_worth')
)

export const get_finance_ytd_change_pct = createSelector(
  [get_finance_overview],
  (overview) => overview.get('ytd_change_pct')
)

export const get_finance_safe_to_spend = createSelector(
  [get_finance_overview],
  (overview) => overview.get('safe_to_spend')
)

export const get_finance_asset_allocation = createSelector(
  [get_finance_overview],
  (overview) => {
    const allocation = overview.get('asset_allocation')
    return allocation?.toJS ? allocation.toJS() : allocation || {}
  }
)

export const get_finance_ytd_business_profit = createSelector(
  [get_finance_overview],
  (overview) => overview.get('ytd_business_profit')
)
