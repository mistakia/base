import { connect } from 'react-redux'
import { createSelector } from 'reselect'

import {
  finance_actions,
  get_finance_is_loading,
  get_finance_net_worth,
  get_finance_ytd_change_pct,
  get_finance_safe_to_spend,
  get_finance_asset_allocation,
  get_finance_ytd_business_profit
} from '@core/finance/index.js'

import FinancePage from './FinancePage.js'

const map_state_to_props = createSelector(
  [
    get_finance_net_worth,
    get_finance_ytd_change_pct,
    get_finance_safe_to_spend,
    get_finance_asset_allocation,
    get_finance_ytd_business_profit,
    get_finance_is_loading
  ],
  (
    net_worth,
    ytd_change_pct,
    safe_to_spend,
    asset_allocation,
    ytd_business_profit,
    is_loading
  ) => ({
    net_worth,
    ytd_change_pct,
    safe_to_spend,
    asset_allocation,
    ytd_business_profit,
    is_loading
  })
)

const map_dispatch_to_props = {
  load_finance_overview: finance_actions.load_finance_overview
}

export default connect(map_state_to_props, map_dispatch_to_props)(FinancePage)
