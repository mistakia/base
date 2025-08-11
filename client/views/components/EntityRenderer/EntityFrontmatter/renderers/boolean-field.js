import React from 'react'
import PropTypes from 'prop-types'
import { FieldRow } from './field-row.js'

export const BooleanField = ({ key_name, value }) => {
  if (typeof value !== 'boolean') return null
  const label = key_name.replace(/_/g, ' ')
  return <FieldRow label={label}>{value ? 'Yes' : 'No'}</FieldRow>
}

BooleanField.propTypes = {
  key_name: PropTypes.string.isRequired,
  value: PropTypes.bool.isRequired
}
