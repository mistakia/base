import React from 'react'
import PropTypes from 'prop-types'
import { Box } from '@mui/material'
import './PathBreadcrumb.styl'

const PathBreadcrumb = ({ path = '', on_navigate }) => {
  const path_parts = path ? path.split('/').filter(Boolean) : []

  // Check if the last part looks like a file (has an extension)
  const is_file_path =
    path_parts.length > 0 && path_parts[path_parts.length - 1].includes('.')

  // Calculate total depth including root
  const total_depth = path_parts.length + 1

  // Set minimum depth for gradual color transitions
  const minimum_depth = 15
  const effective_depth = Math.max(total_depth, minimum_depth)

  const handle_click = (index) => {
    if (index === -1) {
      on_navigate('/')
    } else {
      const new_path = '/' + path_parts.slice(0, index + 1).join('/')
      on_navigate(new_path)
    }
  }

  const get_breadcrumb_color = (position) => {
    // Dynamic color generation from light (1) to dark (using effective_depth for gradual transitions)
    // Position 1 = lightest (deepest/last), higher positions = darker (parents)
    const light_color = 'var(--color-breadcrumb-light)'
    const dark_color = 'var(--color-breadcrumb-dark)'

    if (total_depth === 1) {
      return light_color
    }

    // Calculate interpolation ratio using effective_depth for more gradual transitions
    const ratio = (position - 1) / (effective_depth - 1)
    return `color-mix(in srgb, ${dark_color} ${Math.round(ratio * 100)}%, ${light_color})`
  }

  const get_font_color = (position) => {
    // Adaptive font color based on background darkness
    // Handle single item case (root only)
    if (total_depth === 1) {
      // Single item uses light background, needs dark text
      return '#333333'
    }

    // Use effective_depth for more gradual font color transitions
    const darkness_ratio = (position - 1) / (effective_depth - 1)
    return darkness_ratio < 0.4 ? '#333333' : '#ffffff'
  }

  const breadcrumb_item_style = (position, is_clickable) => {
    const bg_color = get_breadcrumb_color(position)
    const font_color = get_font_color(position)
    const z_index = total_depth - position + 1
    return {
      '--bg-color': bg_color,
      '--font-color': font_color,
      '--z-index': z_index
    }
  }

  // Get background color - if it's a file, use the last breadcrumb's color (position 1 - lightest)
  const get_bar_background = () => {
    if (is_file_path && path_parts.length > 0) {
      return get_breadcrumb_color(1)
    }
    return 'var(--color-breadcrumb-bar-bg)'
  }

  return (
    <Box className='breadcrumb-bar' sx={{ '--bar-bg': get_bar_background() }}>
      {/* Root breadcrumb - position total_depth (darkest, highest index) */}
      <Box
        component={path_parts.length > 0 ? 'button' : 'span'}
        onClick={path_parts.length > 0 ? () => handle_click(-1) : undefined}
        className={`breadcrumb-item ${path_parts.length > 0 ? 'is-clickable' : ''}`}
        sx={breadcrumb_item_style(total_depth, path_parts.length > 0)}>
        <span>user-base</span>
      </Box>

      {/* Path part breadcrumbs - positions from (total_depth - 1) down to 1 */}
      {path_parts.map((part, index) => {
        const is_last = index === path_parts.length - 1
        // Reverse the position: last item gets position 1, first item gets position (total_depth - 1)
        const position = total_depth - 1 - index

        return (
          <Box
            key={index}
            component={is_last ? 'span' : 'button'}
            onClick={is_last ? undefined : () => handle_click(index)}
            className={`breadcrumb-item ${!is_last ? 'is-clickable' : ''}`}
            aria-current={is_last ? 'page' : undefined}
            sx={breadcrumb_item_style(position, !is_last)}>
            <span>{part}</span>
          </Box>
        )
      })}
    </Box>
  )
}

PathBreadcrumb.propTypes = {
  path: PropTypes.string,
  on_navigate: PropTypes.func.isRequired
}

export default PathBreadcrumb
