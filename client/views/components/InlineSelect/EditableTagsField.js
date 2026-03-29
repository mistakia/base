import React, { useState, useRef, useEffect } from 'react'
import PropTypes from 'prop-types'
import { useDispatch, useSelector } from 'react-redux'
import { Box } from '@mui/material'

import { tasks_actions } from '@core/tasks/actions'
import { get_tasks_state } from '@core/tasks/selectors'
import { convert_base_uri_to_path } from '@views/utils/base-uri-constants.js'
import TagChip from '@views/components/primitives/styled/tag-chip.js'
import TagPickerDropdown from './TagPickerDropdown'

const container_sx = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '4px',
  alignItems: 'center'
}

const EditableTagsField = ({ value, base_uri, editable = true }) => {
  const dispatch = useDispatch()
  const [dropdown_open, set_dropdown_open] = useState(false)
  const [local_tags, set_local_tags] = useState(value || [])
  const add_ref = useRef(null)

  const tasks_state = useSelector(get_tasks_state)
  const available_tags = tasks_state.get('available_tags')?.toArray() || []

  // Sync local state with prop changes
  useEffect(() => {
    set_local_tags(value || [])
  }, [value])

  const handle_add_click = (event) => {
    if (!editable) return
    event.stopPropagation()
    // Load available tags if not already loaded
    if (available_tags.length === 0) {
      dispatch(tasks_actions.load_available_tags())
    }
    set_dropdown_open(true)
  }

  const handle_toggle = (tag_base_uri) => {
    const is_currently_selected = local_tags.includes(tag_base_uri)

    if (is_currently_selected) {
      set_local_tags((prev) => prev.filter((t) => t !== tag_base_uri))
      dispatch(
        tasks_actions.remove_entity_tag({
          base_uri,
          tag_base_uri
        })
      )
    } else {
      set_local_tags((prev) => [...prev, tag_base_uri])
      dispatch(
        tasks_actions.add_entity_tag({
          base_uri,
          tag_base_uri
        })
      )
    }
  }

  const handle_close = () => {
    set_dropdown_open(false)
  }

  return (
    <Box sx={container_sx}>
      {local_tags.map((tag_base_uri, index) => {
        const tag_path = convert_base_uri_to_path(tag_base_uri)
        return (
          <TagChip key={index} tag={tag_base_uri} to={tag_path} size='small' />
        )
      })}
      {editable && (
        <span
          ref={add_ref}
          className='chip chip--add'
          onClick={handle_add_click}
          style={{ cursor: 'pointer' }}>
          + Add
        </span>
      )}
      {editable && (
        <TagPickerDropdown
          available_tags={available_tags}
          selected_tags={local_tags}
          on_toggle={handle_toggle}
          on_close={handle_close}
          anchor_el={add_ref.current}
          open={dropdown_open}
        />
      )}
    </Box>
  )
}

EditableTagsField.propTypes = {
  value: PropTypes.array,
  base_uri: PropTypes.string.isRequired,
  editable: PropTypes.bool
}

export default EditableTagsField
