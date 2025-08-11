import React from 'react'
import PropTypes from 'prop-types'
import { FieldRow } from './field-row.js'
import { format_date_time } from '@views/utils/date-formatting.js'

export const DateField = ({ key_name, value }) => {
  if (!value) return null
  const label = key_name.replace(/_/g, ' ')
  return <FieldRow label={label}>{format_date_time(value)}</FieldRow>
}

DateField.propTypes = {
  key_name: PropTypes.string.isRequired,
  value: PropTypes.string.isRequired
}
