import React, { useEffect, useMemo } from 'react'
import PropTypes from 'prop-types'
import { useSelector, useDispatch } from 'react-redux'
import Table from 'react-table/index.js'

import { physical_item_columns } from './column-definitions.js'
import { physical_items_actions } from '@core/physical-items/actions.js'
import {
  get_physical_items_table_props,
  get_physical_item_table_views,
  get_selected_physical_item_table_view,
  get_available_tags_for_physical_item_filter
} from '@core/physical-items/selectors.js'
import { get_has_valid_session } from '@core/app/selectors.js'

import './PhysicalItemsTable.styl'

const PhysicalItemsTable = ({ on_view_select }) => {
  const dispatch = useDispatch()
  const table_props = useSelector(get_physical_items_table_props)
  const available_views = useSelector(get_physical_item_table_views)
  const selected_view = useSelector(get_selected_physical_item_table_view)
  const available_tags = useSelector(
    get_available_tags_for_physical_item_filter
  )
  const has_valid_session = useSelector(get_has_valid_session)

  // Load available tags once authenticated
  useEffect(() => {
    if (has_valid_session) {
      dispatch(
        physical_items_actions.load_available_tags({ used_by: 'physical_item' })
      )
    }
  }, [dispatch, has_valid_session])

  const {
    data = [],
    table_state = {},
    saved_table_state = {},
    all_columns = {},
    is_loading = false,
    is_fetching = false,
    is_fetching_more = false,
    total_row_count = 0,
    total_rows_fetched = 0,
    table_error = null
  } = table_props

  // Merge available tags into column definitions
  const columns_with_tags = useMemo(() => {
    const base_columns =
      Object.keys(all_columns).length > 0 ? all_columns : physical_item_columns
    if (!base_columns.tags) return base_columns

    return {
      ...base_columns,
      tags: {
        ...base_columns.tags,
        column_values: available_tags
      }
    }
  }, [all_columns, available_tags])

  const handle_view_change = (view) => {
    dispatch(physical_items_actions.update_physical_item_table_view({ view }))
  }

  const handle_fetch_more = () => {
    dispatch(
      physical_items_actions.load_physical_items_table({
        view_id: selected_view?.view_id,
        is_append: true
      })
    )
  }

  const select_view = (view_id) => {
    if (on_view_select) {
      on_view_select(view_id)
    }
    dispatch(
      physical_items_actions.select_physical_item_table_view({ view_id })
    )
    dispatch(physical_items_actions.load_physical_items_table({ view_id }))
  }

  const handle_reset_cache = () => {
    dispatch(
      physical_items_actions.load_physical_items_table({
        view_id: selected_view?.view_id
      })
    )
  }

  if (table_error) {
    return <div className='physical-items-table-error'>{table_error}</div>
  }

  return (
    <div className='physical-items-table-container'>
      <Table
        data={data}
        all_columns={columns_with_tags}
        table_state={table_state}
        views={available_views}
        selected_view={selected_view}
        on_view_change={handle_view_change}
        select_view={select_view}
        fetch_more={handle_fetch_more}
        total_row_count={total_row_count}
        total_rows_fetched={total_rows_fetched}
        is_loading={is_loading}
        is_fetching={is_fetching}
        is_fetching_more={is_fetching_more}
        saved_table_state={saved_table_state}
        reset_cache={handle_reset_cache}
        disable_rank_aggregation={true}
        disable_splits={true}
        disable_create_view={true}
        disable_edit_view={true}
      />
    </div>
  )
}

PhysicalItemsTable.propTypes = {
  on_view_select: PropTypes.func
}

export default PhysicalItemsTable
