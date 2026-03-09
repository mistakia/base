import { create_api_action_types, create_api_actions } from '@core/utils'

const GET_TASK_STATS = 'GET_TASK_STATS'

export const task_stats_action_types = {
  ...create_api_action_types(GET_TASK_STATS),

  LOAD_TASK_STATS: 'LOAD_TASK_STATS'
}

export const get_task_stats_actions = create_api_actions(GET_TASK_STATS)

export const task_stats_actions = {
  load_task_stats: () => ({
    type: task_stats_action_types.LOAD_TASK_STATS
  })
}
