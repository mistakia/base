import { create_api_action_types, create_api_actions } from '@core/utils'

const GET_TASKS = 'GET_TASKS'
const GET_TASKS_TABLE = 'GET_TASKS_TABLE'
const PATCH_TASK = 'PATCH_TASK'
const GET_AVAILABLE_TAGS = 'GET_AVAILABLE_TAGS'
const POST_ENTITY_TAGS = 'POST_ENTITY_TAGS'

export const tasks_action_types = {
  ...create_api_action_types(GET_TASKS),
  ...create_api_action_types(GET_TASKS_TABLE),
  ...create_api_action_types(PATCH_TASK),
  ...create_api_action_types(GET_AVAILABLE_TAGS),
  ...create_api_action_types(POST_ENTITY_TAGS),

  LOAD_TASKS: 'LOAD_TASKS',
  LOAD_TASKS_TABLE: 'LOAD_TASKS_TABLE',
  LOAD_AVAILABLE_TAGS: 'LOAD_AVAILABLE_TAGS',

  // Table view management actions
  UPDATE_TASK_TABLE_VIEW: 'UPDATE_TASK_TABLE_VIEW',
  SET_TASK_TABLE_STATE: 'SET_TASK_TABLE_STATE',
  SELECT_TASK_TABLE_VIEW: 'SELECT_TASK_TABLE_VIEW',

  // Task property update actions
  UPDATE_TASK_PROPERTY: 'UPDATE_TASK_PROPERTY',
  REVERT_TASK_UPDATE: 'REVERT_TASK_UPDATE',

  // Entity tag management actions
  ADD_ENTITY_TAG: 'ADD_ENTITY_TAG',
  REMOVE_ENTITY_TAG: 'REMOVE_ENTITY_TAG'
}

export const get_tasks_actions = create_api_actions(GET_TASKS)
export const get_tasks_table_actions = create_api_actions(GET_TASKS_TABLE)
export const patch_task_actions = create_api_actions(PATCH_TASK)
export const get_available_tags_actions = create_api_actions(GET_AVAILABLE_TAGS)
export const post_entity_tags_actions = create_api_actions(POST_ENTITY_TAGS)

export const tasks_actions = {
  load_tasks: () => ({
    type: tasks_action_types.LOAD_TASKS
  }),

  // Table view management actions - update_task_table_view handles on_view_change
  update_task_table_view: ({ view }) => ({
    type: tasks_action_types.UPDATE_TASK_TABLE_VIEW,
    payload: { view }
  }),

  // Set table state directly without triggering a debounced fetch
  set_task_table_state: ({ view_id, table_state }) => ({
    type: tasks_action_types.SET_TASK_TABLE_STATE,
    payload: { view_id, table_state }
  }),

  select_task_table_view: ({ view_id }) => ({
    type: tasks_action_types.SELECT_TASK_TABLE_VIEW,
    payload: { view_id }
  }),

  load_tasks_table: ({
    view_id,
    is_append = false,
    url_filters = [],
    url_sort = null
  } = {}) => ({
    type: tasks_action_types.LOAD_TASKS_TABLE,
    payload: { view_id, is_append, url_filters, url_sort }
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
  }),

  load_available_tags: () => ({
    type: tasks_action_types.LOAD_AVAILABLE_TAGS
  }),

  add_entity_tag: ({ base_uri, tag_base_uri }) => ({
    type: tasks_action_types.ADD_ENTITY_TAG,
    payload: { base_uri, tag_base_uri }
  }),

  remove_entity_tag: ({ base_uri, tag_base_uri }) => ({
    type: tasks_action_types.REMOVE_ENTITY_TAG,
    payload: { base_uri, tag_base_uri }
  })
}
