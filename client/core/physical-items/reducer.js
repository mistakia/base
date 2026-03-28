import { Record, List, Map } from 'immutable'

import { physical_items_action_types } from './actions'
import { physical_item_columns } from '@views/components/PhysicalItemsTable/column-definitions.js'
import { TABLE_OPERATORS } from 'react-table/src/constants.mjs'
import { create_default_table_state } from '@core/table/create-default-table-state.js'
import { create_view } from '@core/table/create-view.js'
import {
  update_view_on_config_change,
  on_table_pending,
  on_table_fulfilled,
  on_table_failed
} from '@core/table/table-reducer-helpers.js'

const DEFAULT_SORT = [
  { column_id: 'importance', desc: true },
  { column_id: 'frequency_of_use', desc: true },
  { column_id: 'updated_at', desc: true }
]

const DEFAULT_PHYSICAL_ITEM_TABLE_STATE = create_default_table_state({
  columns: [
    'title',
    'category',
    'importance',
    'frequency_of_use',
    'tags',
    'updated_at'
  ],
  sort: DEFAULT_SORT
})

const DEFAULT_VIEWS = {
  default: create_view({
    entity_prefix: 'physical_item',
    view_id: 'default',
    view_name: 'All Items',
    table_state: DEFAULT_PHYSICAL_ITEM_TABLE_STATE
  }),
  inventory: create_view({
    entity_prefix: 'physical_item',
    view_id: 'inventory',
    view_name: 'Inventory',
    table_state: create_default_table_state({
      columns: [
        'title',
        'category',
        'exist',
        'consumable',
        'perishable',
        'importance',
        'current_quantity'
      ],
      sort: DEFAULT_SORT,
      where: new List([
        new Map({
          column_id: 'exist',
          operator: TABLE_OPERATORS.EQUAL,
          value: [true]
        })
      ])
    })
  }),
  purchase: create_view({
    entity_prefix: 'physical_item',
    view_id: 'purchase',
    view_name: 'Purchase List',
    table_state: create_default_table_state({
      columns: [
        'title',
        'category',
        'importance',
        'frequency_of_use',
        'current_quantity',
        'target_quantity'
      ],
      sort: DEFAULT_SORT,
      where: new List([
        new Map({
          column_id: 'exist',
          operator: TABLE_OPERATORS.EQUAL,
          value: [false]
        })
      ])
    })
  }),
  home: create_view({
    entity_prefix: 'physical_item',
    view_id: 'home',
    view_name: 'Home',
    table_state: create_default_table_state({
      columns: [
        'title',
        'category',
        'importance',
        'frequency_of_use',
        'consumable',
        'tags'
      ],
      sort: DEFAULT_SORT,
      where: new List([
        new Map({
          column_id: 'category',
          operator: TABLE_OPERATORS.LIKE,
          value: ['home']
        })
      ])
    })
  }),
  overlander: create_view({
    entity_prefix: 'physical_item',
    view_id: 'overlander',
    view_name: 'Overlander',
    table_state: create_default_table_state({
      columns: [
        'title',
        'category',
        'importance',
        'frequency_of_use',
        'consumable',
        'tags'
      ],
      sort: DEFAULT_SORT,
      where: new List([
        new Map({
          column_id: 'category',
          operator: TABLE_OPERATORS.LIKE,
          value: ['overlander']
        })
      ])
    })
  }),
  vehicle: create_view({
    entity_prefix: 'physical_item',
    view_id: 'vehicle',
    view_name: 'Vehicle',
    table_state: create_default_table_state({
      columns: [
        'title',
        'category',
        'importance',
        'frequency_of_use',
        'consumable',
        'tags'
      ],
      sort: DEFAULT_SORT,
      where: new List([
        new Map({
          column_id: 'category',
          operator: TABLE_OPERATORS.LIKE,
          value: ['vehicle']
        })
      ])
    })
  }),
  investment_property: create_view({
    entity_prefix: 'physical_item',
    view_id: 'investment_property',
    view_name: 'Investment Property',
    table_state: create_default_table_state({
      columns: [
        'title',
        'category',
        'importance',
        'frequency_of_use',
        'consumable',
        'tags'
      ],
      sort: DEFAULT_SORT,
      where: new List([
        new Map({
          column_id: 'category',
          operator: TABLE_OPERATORS.LIKE,
          value: ['investment-property']
        })
      ])
    })
  })
}

const PhysicalItemsState = new Record({
  // Available tags for filter dropdown
  available_tags: new List(),
  is_loading_available_tags: false,
  available_tags_error: null,

  // Table views management
  physical_item_table_views: new Map(DEFAULT_VIEWS),
  selected_physical_item_table_view_id: 'default',
  physical_item_all_columns: Map(physical_item_columns)
})

export function physical_items_reducer(
  state = new PhysicalItemsState(),
  { payload, type }
) {
  switch (type) {
    // Available tags actions
    case physical_items_action_types.GET_AVAILABLE_TAGS_PENDING:
      return state.merge({
        is_loading_available_tags: true,
        available_tags_error: null
      })

    case physical_items_action_types.GET_AVAILABLE_TAGS_FULFILLED: {
      const tags = Array.isArray(payload.data) ? payload.data : []
      return state.merge({
        available_tags: new List(tags),
        is_loading_available_tags: false,
        available_tags_error: null
      })
    }

    case physical_items_action_types.GET_AVAILABLE_TAGS_FAILED:
      return state.merge({
        is_loading_available_tags: false,
        available_tags_error: payload.error
      })

    // Table view management actions
    case physical_items_action_types.UPDATE_PHYSICAL_ITEM_TABLE_VIEW: {
      const { view } = payload
      const view_id = view?.view_id || 'default'
      return state.updateIn(
        ['physical_item_table_views', view_id],
        (existing_view) =>
          update_view_on_config_change({
            view: existing_view,
            entity_prefix: 'physical_item',
            view_id,
            view_name: view?.view_name,
            table_state: view?.table_state
          })
      )
    }

    case physical_items_action_types.SET_PHYSICAL_ITEM_TABLE_STATE: {
      const { view_id: set_view_id, table_state: new_table_state } = payload
      const target_view_id = set_view_id || 'default'
      return state.setIn(
        [
          'physical_item_table_views',
          target_view_id,
          'physical_item_table_state'
        ],
        new Map(new_table_state)
      )
    }

    case physical_items_action_types.SELECT_PHYSICAL_ITEM_TABLE_VIEW:
      return state.set(
        'selected_physical_item_table_view_id',
        payload.view_id
      )

    case physical_items_action_types.GET_PHYSICAL_ITEMS_TABLE_PENDING: {
      const view_id_pending = payload.opts?.view_id || 'default'
      return state.updateIn(
        ['physical_item_table_views', view_id_pending],
        (view) =>
          on_table_pending({
            view,
            entity_prefix: 'physical_item',
            is_append: payload.opts?.is_append
          })
      )
    }

    case physical_items_action_types.GET_PHYSICAL_ITEMS_TABLE_FULFILLED: {
      const is_append = payload.opts?.is_append || false
      const view_id_fulfilled = payload.opts?.view_id || 'default'
      const rows = Array.isArray(payload.data?.rows) ? payload.data.rows : []
      const total_row_count =
        typeof payload.data?.total_row_count === 'number'
          ? payload.data.total_row_count
          : 0

      return state.updateIn(
        ['physical_item_table_views', view_id_fulfilled],
        (view) =>
          on_table_fulfilled({
            view,
            entity_prefix: 'physical_item',
            rows,
            is_append,
            total_row_count
          })
      )
    }

    case physical_items_action_types.GET_PHYSICAL_ITEMS_TABLE_FAILED: {
      const view_id_failed = payload.opts?.view_id || 'default'
      return state.updateIn(
        ['physical_item_table_views', view_id_failed],
        (view) =>
          on_table_failed({
            view,
            entity_prefix: 'physical_item',
            error: payload.error
          })
      )
    }

    default:
      return state
  }
}

export default physical_items_reducer
