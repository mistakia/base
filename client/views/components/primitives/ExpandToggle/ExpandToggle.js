import React from 'react'
import PropTypes from 'prop-types'
import {
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon
} from '@mui/icons-material'

import '@styles/components/expand-toggle.styl'

/**
 * ExpandToggle Component
 *
 * A reusable expand/collapse toggle button following the design system.
 * Used for collapsible content sections throughout the application.
 *
 * @param {boolean} is_expanded - Current expansion state
 * @param {function} on_toggle - Toggle handler function
 * @param {string} expanded_label - Label when content is expanded (default: 'Less')
 * @param {string} collapsed_label - Label when content is collapsed (default: 'More')
 * @param {string} className - Additional CSS classes
 */
const ExpandToggle = ({
  is_expanded,
  on_toggle,
  expanded_label = 'Less',
  collapsed_label = 'More',
  className = ''
}) => {
  const class_names = ['expand-toggle', className].filter(Boolean).join(' ')

  return (
    <button className={class_names} onClick={on_toggle} type='button'>
      {is_expanded ? (
        <>
          <ExpandLessIcon fontSize='inherit' />
          <span>{expanded_label}</span>
        </>
      ) : (
        <>
          <ExpandMoreIcon fontSize='inherit' />
          <span>{collapsed_label}</span>
        </>
      )}
    </button>
  )
}

ExpandToggle.propTypes = {
  is_expanded: PropTypes.bool.isRequired,
  on_toggle: PropTypes.func.isRequired,
  expanded_label: PropTypes.string,
  collapsed_label: PropTypes.string,
  className: PropTypes.string
}

export default ExpandToggle
