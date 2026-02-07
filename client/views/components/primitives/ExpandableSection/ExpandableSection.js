import React, { useState } from 'react'
import PropTypes from 'prop-types'
import {
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon
} from '@mui/icons-material'

import '@styles/components/expandable-section.styl'

/**
 * ExpandableSection Component
 *
 * A collapsible section with a clickable header and animated content.
 * Used for organizing content into expandable/collapsible panels.
 *
 * @param {string} title - Header title text
 * @param {React.ReactNode} children - Content to show when expanded
 * @param {boolean} default_expanded - Initial expansion state (default: false)
 * @param {boolean} disabled - Whether expansion is disabled
 * @param {React.ReactNode} header_content - Optional content to render next to title
 * @param {string} className - Additional CSS classes for the container
 * @param {function} on_toggle - Optional callback when expansion state changes
 */
const ExpandableSection = ({
  title,
  children,
  default_expanded = false,
  disabled = false,
  header_content = null,
  className = '',
  on_toggle = null
}) => {
  const [is_expanded, set_is_expanded] = useState(default_expanded)

  const handle_toggle = () => {
    if (disabled) return
    const new_state = !is_expanded
    set_is_expanded(new_state)
    if (on_toggle) {
      on_toggle(new_state)
    }
  }

  const container_classes = [
    'expandable-section',
    is_expanded && 'expandable-section--expanded',
    disabled && 'expandable-section--disabled',
    className
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={container_classes}>
      <button
        className='expandable-section__header'
        onClick={handle_toggle}
        type='button'
        disabled={disabled}
        aria-expanded={is_expanded}>
        <span className='expandable-section__title'>{title}</span>
        {header_content && (
          <span className='expandable-section__header-content'>
            {header_content}
          </span>
        )}
        <span className='expandable-section__icon'>
          {is_expanded ? (
            <ExpandLessIcon fontSize='small' />
          ) : (
            <ExpandMoreIcon fontSize='small' />
          )}
        </span>
      </button>
      {is_expanded && (
        <div className='expandable-section__content'>{children}</div>
      )}
    </div>
  )
}

ExpandableSection.propTypes = {
  title: PropTypes.string.isRequired,
  children: PropTypes.node.isRequired,
  default_expanded: PropTypes.bool,
  disabled: PropTypes.bool,
  header_content: PropTypes.node,
  className: PropTypes.string,
  on_toggle: PropTypes.func
}

export default ExpandableSection
