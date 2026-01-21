import React, { useState, useRef, useEffect } from 'react'
import PropTypes from 'prop-types'
import { useDispatch } from 'react-redux'

import { TASK_PRIORITY } from '#libs-shared/task-constants.mjs'
import { to_snake_slug } from '@core/utils'
import { tasks_actions } from '@core/tasks/actions'
import InlineSelectDropdown from './InlineSelectDropdown'

// Order by severity: Critical to None
const PRIORITY_OPTIONS = [
  TASK_PRIORITY.CRITICAL,
  TASK_PRIORITY.HIGH,
  TASK_PRIORITY.MEDIUM,
  TASK_PRIORITY.LOW,
  TASK_PRIORITY.NONE
]

const EditablePriorityField = ({ value, base_uri, context, editable = true }) => {
  const dispatch = useDispatch()
  const [dropdown_open, set_dropdown_open] = useState(false)
  const [local_priority, set_local_priority] = useState(
    value || TASK_PRIORITY.NONE
  )
  const anchor_ref = useRef(null)

  // Sync local state with prop changes (e.g., from parent refetch)
  useEffect(() => {
    set_local_priority(value || TASK_PRIORITY.NONE)
  }, [value])

  const priority_slug = to_snake_slug(local_priority) || 'none'

  const handle_click = (event) => {
    if (!editable) return
    event.stopPropagation()
    set_dropdown_open(true)
  }

  const handle_change = (new_value) => {
    if (new_value !== local_priority) {
      const previous_value = local_priority
      // Optimistically update local state
      set_local_priority(new_value)
      dispatch(
        tasks_actions.update_task_property({
          base_uri,
          property_name: 'priority',
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
        data-priority={priority_slug}
        className='task-priority'
        onClick={editable ? handle_click : undefined}
        style={{
          fontWeight: 500,
          fontSize: context === 'table' ? '0.875rem' : '14px',
          lineHeight: '1.2',
          cursor: editable ? 'pointer' : 'default'
        }}>
        {local_priority}
      </span>
      {editable && (
        <InlineSelectDropdown
          options={PRIORITY_OPTIONS}
          value={local_priority}
          on_change={handle_change}
          on_close={handle_close}
          anchor_el={anchor_ref.current}
          open={dropdown_open}
          color_attribute='priority'
        />
      )}
    </div>
  )
}

EditablePriorityField.propTypes = {
  value: PropTypes.string,
  base_uri: PropTypes.string.isRequired,
  context: PropTypes.oneOf(['table', 'entity-page']),
  editable: PropTypes.bool
}

export default EditablePriorityField
