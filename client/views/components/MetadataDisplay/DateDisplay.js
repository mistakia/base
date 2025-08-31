import React from 'react'
import PropTypes from 'prop-types'
import { Box } from '@mui/material'
import { format_relative_time } from '@views/utils/date-formatting.js'

const format_short_date = (date_string) => {
  if (!date_string) return null

  try {
    const date = new Date(date_string)
    if (isNaN(date.getTime())) return null

    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')

    let hours = date.getHours()
    const minutes = String(date.getMinutes()).padStart(2, '0')
    const ampm = hours >= 12 ? 'PM' : 'AM'
    hours = hours % 12
    hours = hours || 12

    return `${year}/${month}/${day} ${hours}:${minutes} ${ampm}`
  } catch {
    return null
  }
}

const is_valid_date = (date_string) => {
  if (!date_string) return false

  try {
    const date = new Date(date_string)
    return !isNaN(date.getTime())
  } catch {
    return false
  }
}

const DateDisplay = ({
  date,
  show_relative = true,
  show_absolute = true,
  relative_style = {},
  absolute_style = {},
  sx = {}
}) => {
  if (!date || !is_valid_date(date)) return '-'

  const relative_time = show_relative ? format_relative_time(date) : null
  const absolute_time = show_absolute ? format_short_date(date) : null

  // Check if formatting returned valid results
  if (show_relative && !relative_time) return '-'
  if (show_absolute && !absolute_time) return '-'

  if (show_relative && show_absolute) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: '2px', ...sx }}>
        <Box sx={{ fontSize: '14px', color: '#333', ...relative_style }}>
          {relative_time}
        </Box>
        <Box sx={{ fontSize: '11px', color: '#999', ...absolute_style }}>
          {absolute_time}
        </Box>
      </Box>
    )
  }

  if (show_relative) {
    return (
      <Box sx={{ fontSize: '14px', color: '#333', ...relative_style, ...sx }}>
        {relative_time}
      </Box>
    )
  }

  if (show_absolute) {
    return (
      <Box sx={{ fontSize: '14px', color: '#333', ...absolute_style, ...sx }}>
        {absolute_time}
      </Box>
    )
  }

  return null
}

DateDisplay.propTypes = {
  date: PropTypes.string,
  show_relative: PropTypes.bool,
  show_absolute: PropTypes.bool,
  relative_style: PropTypes.object,
  absolute_style: PropTypes.object,
  sx: PropTypes.object
}

export default DateDisplay
