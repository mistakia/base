import { create_api_action_types, create_api_actions } from '@core/utils'

const GET_ACTIVITY_HEATMAP = 'GET_ACTIVITY_HEATMAP'

export const activity_action_types = {
  ...create_api_action_types(GET_ACTIVITY_HEATMAP),

  LOAD_ACTIVITY_HEATMAP: 'LOAD_ACTIVITY_HEATMAP'
}

export const get_activity_heatmap_actions =
  create_api_actions(GET_ACTIVITY_HEATMAP)

export const activity_actions = {
  load_activity_heatmap: ({ days = 365 } = {}) => ({
    type: activity_action_types.LOAD_ACTIVITY_HEATMAP,
    payload: { days }
  })
}
