import React from 'react'
import PropTypes from 'prop-types'
import { to_snake_slug } from '@core/utils'
import { convert_base_uri_to_path } from '@views/utils/base-uri-constants.js'

const Task = ({ task }) => {
  const get_shorthand_date = (date_string) => {
    if (!date_string) return null
    const date = new Date(date_string)
    const month = (date.getMonth() + 1).toString().padStart(2, '0')
    const day = date.getDate().toString().padStart(2, '0')
    return `${month}/${day}`
  }

  const finish_by = get_shorthand_date(task.entity_properties.finish_by)

  const status_slug =
    to_snake_slug(task.entity_properties.status) || 'no_status'
  const priority_slug = to_snake_slug(task.entity_properties.priority) || 'none'

  // Generate the href for the link
  const get_href = () => {
    if (task.is_redacted) {
      return null
    }

    if (task.file_info.base_uri) {
      const navigation_path = convert_base_uri_to_path(task.file_info.base_uri)
      return navigation_path
    }

    return null
  }

  return (
    <div className='task-row'>
      <a
        href={get_href()}
        target='_blank'
        rel='noopener noreferrer'
        className='task-title'
        style={{ textDecoration: 'none', color: 'inherit' }}>
        {task.entity_properties.title}
      </a>
      <div className='task-status' data-status={status_slug}>
        {task.entity_properties.status}
      </div>
      <div className='task-priority' data-priority={priority_slug}>
        {task.entity_properties.priority || 'None'}
      </div>
      <div className='task-finish-by'>{finish_by || '-'}</div>
    </div>
  )
}

Task.propTypes = {
  task: PropTypes.object.isRequired
}

export default Task
