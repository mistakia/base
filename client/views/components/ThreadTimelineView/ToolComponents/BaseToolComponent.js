import React from 'react'
import PropTypes from 'prop-types'
import { Box } from '@mui/material'
import DefaultToolHeader from './shared/DefaultToolHeader'

const BaseToolComponent = ({
  tool_call_event,
  children,
  action_button,
  title_override,
  header,
  show_header = true
}) => {
  const tool_name = tool_call_event?.content?.tool_name || 'Unknown Tool'
  const tool_params = tool_call_event?.content?.tool_parameters || {}

  return (
    <Box>
      {show_header &&
        (header || (
          <DefaultToolHeader
            tool_name={tool_name}
            tool_params={tool_params}
            title_override={title_override}
            action_button={action_button}
          />
        ))}

      <Box>{children}</Box>
    </Box>
  )
}

BaseToolComponent.propTypes = {
  tool_call_event: PropTypes.object.isRequired,
  children: PropTypes.node,
  action_button: PropTypes.shape({
    label: PropTypes.string.isRequired,
    onClick: PropTypes.func.isRequired
  }),
  title_override: PropTypes.string,
  header: PropTypes.node,
  show_header: PropTypes.bool
}

export default BaseToolComponent
