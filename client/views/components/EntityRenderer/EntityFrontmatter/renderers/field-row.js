import React from 'react'
import PropTypes from 'prop-types'
import { TableRow, TableCell } from '@mui/material'

const label_sx = {
  fontWeight: 600,
  width: '80px',
  fontSize: '11px',
  wordWrap: 'break-word',
  overflowWrap: 'break-word',
  verticalAlign: 'top'
}

const value_sx = {
  fontSize: '11px',
  wordWrap: 'break-word',
  overflowWrap: 'break-word'
}

export const FieldRow = ({ label, children }) => (
  <TableRow>
    <TableCell sx={label_sx}>{label}</TableCell>
    <TableCell sx={value_sx}>{children}</TableCell>
  </TableRow>
)

FieldRow.propTypes = {
  label: PropTypes.string.isRequired,
  children: PropTypes.node.isRequired
}
