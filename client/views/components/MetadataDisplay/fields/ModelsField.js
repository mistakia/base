import React from 'react'
import PropTypes from 'prop-types'
import MetadataRow from '../MetadataRow.js'
import { render_models_value } from '../formatters/index.js'

const ModelsField = ({
  models,
  label = 'Models',
  is_first = false,
  border_style = 'default'
}) => {
  if (!models || models.length === 0) return null

  return (
    <MetadataRow
      label={label}
      value={render_models_value({ models })}
      is_first={is_first}
      border_style={border_style}
    />
  )
}

ModelsField.propTypes = {
  models: PropTypes.arrayOf(PropTypes.string),
  label: PropTypes.string,
  is_first: PropTypes.bool,
  border_style: PropTypes.oneOf(['default', 'compact', 'none'])
}

export default ModelsField
