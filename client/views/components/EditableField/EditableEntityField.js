import React, { useState, useRef, useEffect } from 'react'
import PropTypes from 'prop-types'
import { useDispatch } from 'react-redux'

import { entity_actions } from '@core/entities/actions'
import { entity_field_schema } from '@views/components/EntityRenderer/EntityFrontmatter/field-schema-config'
import InlineSelectDropdown from '@views/components/InlineSelect/InlineSelectDropdown'
import InlineTextInput from './InlineTextInput'

const BOOLEAN_OPTIONS = ['Yes', 'No']

const EditableEntityField = ({ field_name, value, base_uri, entity_type }) => {
  const dispatch = useDispatch()
  const schema = entity_field_schema[entity_type]?.[field_name]

  if (!schema) {
    return (
      <span>
        {value !== null && value !== undefined ? String(value) : 'N/A'}
      </span>
    )
  }

  const handle_change = (new_value) => {
    dispatch(
      entity_actions.update_entity_property({
        base_uri,
        property_name: field_name,
        value: new_value,
        previous_value: value
      })
    )
  }

  if (schema.type === 'select') {
    return (
      <SelectField
        options={schema.options}
        value={value}
        on_change={handle_change}
      />
    )
  }

  if (schema.type === 'boolean') {
    return (
      <SelectField
        options={BOOLEAN_OPTIONS}
        value={value === true ? 'Yes' : value === false ? 'No' : null}
        on_change={(new_value) => handle_change(new_value === 'Yes')}
      />
    )
  }

  if (
    schema.type === 'number' ||
    schema.type === 'string' ||
    schema.type === 'text' ||
    schema.type === 'date'
  ) {
    return (
      <InlineTextInput
        value={value}
        on_change={handle_change}
        type={schema.type}
      />
    )
  }

  return (
    <span>{value !== null && value !== undefined ? String(value) : 'N/A'}</span>
  )
}

const SelectField = ({ options, value, on_change }) => {
  const [dropdown_open, set_dropdown_open] = useState(false)
  const [local_value, set_local_value] = useState(value)
  const anchor_ref = useRef(null)

  useEffect(() => {
    set_local_value(value)
  }, [value])

  const handle_click = (event) => {
    event.stopPropagation()
    set_dropdown_open(true)
  }

  const handle_change = (new_value) => {
    if (new_value !== local_value) {
      set_local_value(new_value)
      on_change(new_value)
    }
  }

  const display_value = local_value || 'N/A'

  return (
    <span>
      <span
        ref={anchor_ref}
        onClick={handle_click}
        style={{
          cursor: 'pointer',
          fontSize: '14px',
          padding: '2px 4px',
          borderRadius: '3px'
        }}>
        {display_value}
      </span>
      <InlineSelectDropdown
        options={options}
        value={local_value}
        on_change={handle_change}
        on_close={() => set_dropdown_open(false)}
        anchor_el={anchor_ref.current}
        open={dropdown_open}
      />
    </span>
  )
}

SelectField.propTypes = {
  options: PropTypes.arrayOf(PropTypes.string).isRequired,
  value: PropTypes.string,
  on_change: PropTypes.func.isRequired
}

EditableEntityField.propTypes = {
  field_name: PropTypes.string.isRequired,
  value: PropTypes.any,
  base_uri: PropTypes.string.isRequired,
  entity_type: PropTypes.string.isRequired
}

export default EditableEntityField
