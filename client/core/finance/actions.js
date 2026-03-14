import { create_api_action_types, create_api_actions } from '@core/utils'

const GET_FINANCE_OVERVIEW = 'GET_FINANCE_OVERVIEW'

export const finance_action_types = {
  ...create_api_action_types(GET_FINANCE_OVERVIEW),

  LOAD_FINANCE_OVERVIEW: 'LOAD_FINANCE_OVERVIEW'
}

export const get_finance_overview_actions =
  create_api_actions(GET_FINANCE_OVERVIEW)

export const finance_actions = {
  load_finance_overview: () => ({
    type: finance_action_types.LOAD_FINANCE_OVERVIEW
  })
}
