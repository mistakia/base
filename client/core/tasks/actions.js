import { create_api_action_types, create_api_actions } from '@core/utils'

const GET_TASKS = 'GET_TASKS'
const GET_TASKS_TABLE = 'GET_TASKS_TABLE'
const PATCH_TASK = 'PATCH_TASK'

export const tasks_action_types = {
  ...create_api_action_types(GET_TASKS),
  ...create_api_action_types(GET_TASKS_TABLE),
  ...create_api_action_types(PATCH_TASK),

  LOAD_TASKS: 'LOAD_TASKS',
  LOAD_TASKS_TABLE: 'LOAD_TASKS_TABLE',

  // Table view management actions
  UPDATE_TASK_TABLE_VIEW: 'UPDATE_TASK_TABLE_VIEW',
  SELECT_TASK_TABLE_VIEW: 'SELECT_TASK_TABLE_VIEW',

  // Task property update actions
  UPDATE_TASK_PROPERTY: 'UPDATE_TASK_PROPERTY',
  REVERT_TASK_UPDATE: 'REVERT_TASK_UPDATE'
}

export const get_tasks_actions = create_api_actions(GET_TASKS)
export const get_tasks_table_actions = create_api_actions(GET_TASKS_TABLE)
export const patch_task_actions = create_api_actions(PATCH_TASK)

export const tasks_actions = {
  load_tasks: () => ({
    type: tasks_action_types.LOAD_TASKS
  }),

  // Table view management actions - update_task_table_view handles on_view_change
  update_task_table_view: ({ view }) => ({
    type: tasks_action_types.UPDATE_TASK_TABLE_VIEW,
    payload: { view }
  }),

  select_task_table_view: ({ view_id }) => ({
    type: tasks_action_types.SELECT_TASK_TABLE_VIEW,
    payload: { view_id }
  }),

  load_tasks_table: ({ view_id, is_append = false } = {}) => ({
    type: tasks_action_types.LOAD_TASKS_TABLE,
    payload: { view_id, is_append }
  }),

  update_task_property: ({
    base_uri,
    property_name,
    value,
    previous_value
  }) => ({
    type: tasks_action_types.UPDATE_TASK_PROPERTY,
    payload: { base_uri, property_name, value, previous_value }
  }),

  revert_task_update: ({ base_uri, property_name, previous_value }) => ({
    type: tasks_action_types.REVERT_TASK_UPDATE,
    payload: { base_uri, property_name, previous_value }
  })
}
