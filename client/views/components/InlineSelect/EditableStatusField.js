import React, { useState, useRef, useEffect } from 'react'
import PropTypes from 'prop-types'
import { useDispatch } from 'react-redux'

import { TASK_STATUS } from '#libs-shared/task-constants.mjs'
import { to_snake_slug } from '@core/utils'
import { tasks_actions } from '@core/tasks/actions'
import InlineSelectDropdown from './InlineSelectDropdown'

const STATUS_OPTIONS = Object.values(TASK_STATUS)

const EditableStatusField = ({ value, base_uri, context }) => {
  const dispatch = useDispatch()
  const [dropdown_open, set_dropdown_open] = useState(false)
  const [local_status, set_local_status] = useState(value || TASK_STATUS.NO_STATUS)
  const anchor_ref = useRef(null)

  // Sync local state with prop changes (e.g., from parent refetch)
  useEffect(() => {
    set_local_status(value || TASK_STATUS.NO_STATUS)
  }, [value])

  const status_slug = to_snake_slug(local_status) || 'no_status'

  const handle_click = (event) => {
    event.stopPropagation()
    set_dropdown_open(true)
  }

  const handle_change = (new_value) => {
    if (new_value !== local_status) {
      const previous_value = local_status
      // Optimistically update local state
      set_local_status(new_value)
      dispatch(
        tasks_actions.update_task_property({
          base_uri,
          property_name: 'status',
          value: new_value,
          previous_value
        })
      )
    }
  }

  const handle_close = () => {
    set_dropdown_open(false)
  }

  const container_style =
    context === 'table'
      ? {
          height: 'fit-content',
          justifyContent: 'flex-start',
          width: '100%'
        }
      : {}

  return (
    <div
      className={context === 'table' ? 'cell-content' : ''}
      style={container_style}>
      <span
        ref={anchor_ref}
        data-status={status_slug}
        className='task-status'
        onClick={handle_click}
        style={{
          fontWeight: 500,
          fontSize: context === 'table' ? '0.875rem' : '14px',
          lineHeight: '1.2',
          cursor: 'pointer'
        }}>
        {local_status}
      </span>
      <InlineSelectDropdown
        options={STATUS_OPTIONS}
        value={local_status}
        on_change={handle_change}
        on_close={handle_close}
        anchor_el={anchor_ref.current}
        open={dropdown_open}
        color_attribute='status'
      />
    </div>
  )
}

EditableStatusField.propTypes = {
  value: PropTypes.string,
  base_uri: PropTypes.string.isRequired,
  context: PropTypes.oneOf(['table', 'entity-page'])
}

export default EditableStatusField
