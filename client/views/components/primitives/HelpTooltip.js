import React from 'react'
import Tooltip from '@mui/material/Tooltip'

const ENTER_DELAY_MS = 500

const tooltip_sx = {
  fontSize: '11px',
  fontFamily: "'IBM Plex Mono', Monaco, Menlo, monospace",
  maxWidth: 260,
  lineHeight: 1.5,
  padding: '6px 10px',
  backgroundColor: '#f5eee6',
  color: '#212529',
  border: '1px solid #e8dcc8',
  borderRadius: '2px',
  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)'
}

const arrow_sx = {
  color: '#f5eee6',
  '&::before': {
    border: '1px solid #e8dcc8'
  }
}

const HelpTooltip = ({ title, children, placement = 'bottom', ...props }) => (
  <Tooltip
    title={title}
    enterDelay={ENTER_DELAY_MS}
    enterNextDelay={ENTER_DELAY_MS}
    arrow
    placement={placement}
    slotProps={{
      tooltip: { sx: tooltip_sx },
      arrow: { sx: arrow_sx }
    }}
    {...props}>
    {children}
  </Tooltip>
)

export default HelpTooltip
