import React from 'react'
import PropTypes from 'prop-types'
import { FieldRow } from './field-row.js'

export const DefaultField = ({ key_name, value }) => {
  if (value == null) return null
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const label = key_name.replace(/_/g, ' ')
  return <FieldRow label={label}>{value}</FieldRow>
}

DefaultField.propTypes = {
  key_name: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number])
}
