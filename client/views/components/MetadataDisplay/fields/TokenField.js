import React from 'react'
import PropTypes from 'prop-types'
import MetadataRow from '@components/MetadataDisplay/MetadataRow.js'
import { format_token_shorthand } from '@components/MetadataDisplay/formatters/index.js'

const TokenField = ({
  value,
  label = 'Tokens',
  is_first = false,
  border_style = 'default'
}) => (
  <MetadataRow
    label={label}
    value={format_token_shorthand({ count: value })}
    is_first={is_first}
    border_style={border_style}
  />
)

TokenField.propTypes = {
  value: PropTypes.number,
  label: PropTypes.string,
  is_first: PropTypes.bool,
  border_style: PropTypes.oneOf(['default', 'compact', 'none'])
}

export default TokenField
