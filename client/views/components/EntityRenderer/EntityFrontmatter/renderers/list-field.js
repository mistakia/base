import React from 'react'
import PropTypes from 'prop-types'
import { FieldRow } from './field-row.js'

export const ListField = ({ key_name, value }) => {
  if (!Array.isArray(value)) return null
  const label = key_name.replace(/_/g, ' ')
  return <FieldRow label={label}>{value.join(', ')}</FieldRow>
}

ListField.propTypes = {
  key_name: PropTypes.string.isRequired,
  value: PropTypes.array.isRequired
}
