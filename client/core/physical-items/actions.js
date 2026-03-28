import { create_api_action_types, create_api_actions } from '@core/utils'

const GET_PHYSICAL_ITEMS_TABLE = 'GET_PHYSICAL_ITEMS_TABLE'
const GET_PHYSICAL_ITEMS_AVAILABLE_TAGS = 'GET_PHYSICAL_ITEMS_AVAILABLE_TAGS'

export const physical_items_action_types = {
  ...create_api_action_types(GET_PHYSICAL_ITEMS_TABLE),
  ...create_api_action_types(GET_PHYSICAL_ITEMS_AVAILABLE_TAGS),

  LOAD_PHYSICAL_ITEMS_TABLE: 'LOAD_PHYSICAL_ITEMS_TABLE',
  LOAD_PHYSICAL_ITEMS_AVAILABLE_TAGS: 'LOAD_PHYSICAL_ITEMS_AVAILABLE_TAGS',

  // Table view management actions
  UPDATE_PHYSICAL_ITEM_TABLE_VIEW: 'UPDATE_PHYSICAL_ITEM_TABLE_VIEW',
  SET_PHYSICAL_ITEM_TABLE_STATE: 'SET_PHYSICAL_ITEM_TABLE_STATE',
  SELECT_PHYSICAL_ITEM_TABLE_VIEW: 'SELECT_PHYSICAL_ITEM_TABLE_VIEW'
}

export const get_physical_items_table_actions = create_api_actions(
  GET_PHYSICAL_ITEMS_TABLE
)
export const get_available_tags_actions = create_api_actions(
  GET_PHYSICAL_ITEMS_AVAILABLE_TAGS
)

export const physical_items_actions = {
  update_physical_item_table_view: ({ view }) => ({
    type: physical_items_action_types.UPDATE_PHYSICAL_ITEM_TABLE_VIEW,
    payload: { view }
  }),

  set_physical_item_table_state: ({ view_id, table_state }) => ({
    type: physical_items_action_types.SET_PHYSICAL_ITEM_TABLE_STATE,
    payload: { view_id, table_state }
  }),

  select_physical_item_table_view: ({ view_id }) => ({
    type: physical_items_action_types.SELECT_PHYSICAL_ITEM_TABLE_VIEW,
    payload: { view_id }
  }),

  load_physical_items_table: ({
    view_id,
    is_append = false,
    url_filters = [],
    url_sort = null
  } = {}) => ({
    type: physical_items_action_types.LOAD_PHYSICAL_ITEMS_TABLE,
    payload: { view_id, is_append, url_filters, url_sort }
  }),

  load_available_tags: ({ used_by } = {}) => ({
    type: physical_items_action_types.LOAD_PHYSICAL_ITEMS_AVAILABLE_TAGS,
    payload: { used_by }
  })
}
