import React from 'react'
import PropTypes from 'prop-types'

import './task.styl'

export default function Task({
  task,
  variant = 'default',
  className = '',
  children
}) {
  const { title, description, status, priority } = task

  const base_class_name = `task-item task-item-${variant} ${className}`

  return (
    <div className={base_class_name}>
      <div className='task-title'>{title}</div>
      {status && <div className='task-status'>{status}</div>}
      {priority && <div className='task-priority'>{priority}</div>}
      {variant === 'detailed' && description && (
        <div className='task-description'>{description}</div>
      )}
      {children}
    </div>
  )
}

Task.propTypes = {
  task: PropTypes.shape({
    task_id: PropTypes.string.isRequired,
    title: PropTypes.string.isRequired,
    description: PropTypes.string,
    status: PropTypes.string,
    priority: PropTypes.string,
    created_at: PropTypes.string,
    updated_at: PropTypes.string
  }).isRequired,
  variant: PropTypes.oneOf(['default', 'preview', 'detailed']),
  className: PropTypes.string,
  children: PropTypes.node
}
