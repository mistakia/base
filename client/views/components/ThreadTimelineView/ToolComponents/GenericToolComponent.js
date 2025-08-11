import React from 'react'
import PropTypes from 'prop-types'
import { Box } from '@mui/material'
import { Build as ToolIcon } from '@mui/icons-material'
import BaseToolComponent from './BaseToolComponent'
import { MonospaceText } from '@views/components/primitives/styled'

const GenericToolComponent = ({ tool_call_event, tool_result_event }) => {
  const render_parameters = () => {
    const parameters = tool_call_event?.content?.tool_parameters

    if (!parameters) return null

    return (
      <Box sx={{ mb: 2 }}>
        <MonospaceText
          variant='xs'
          sx={{ display: 'block', mb: 1, fontWeight: 'bold' }}>
          Parameters:
        </MonospaceText>
        <MonospaceText
          variant='xs'
          component='pre'
          sx={{
            bgcolor: 'grey.100',
            p: 1,
            borderRadius: 1,
            overflow: 'auto',
            maxHeight: '200px',
            border: '1px solid',
            borderColor: 'grey.300'
          }}>
          {JSON.stringify(parameters, null, 2)}
        </MonospaceText>
      </Box>
    )
  }

  const render_result = () => {
    if (!tool_result_event) return null

    const result = tool_result_event?.content?.result

    return (
      <Box>
        <MonospaceText
          variant='xs'
          sx={{ display: 'block', mb: 1, fontWeight: 'bold' }}>
          Result:
        </MonospaceText>
        <MonospaceText
          variant='xs'
          component='pre'
          sx={{
            bgcolor: 'grey.50',
            p: 1,
            borderRadius: 1,
            overflow: 'auto',
            maxHeight: '300px',
            border: '1px solid',
            borderColor: 'grey.200',
            whiteSpace: 'pre-wrap'
          }}>
          {typeof result === 'string'
            ? result
            : JSON.stringify(result, null, 2)}
        </MonospaceText>
      </Box>
    )
  }

  return (
    <BaseToolComponent
      tool_call_event={tool_call_event}
      icon={<ToolIcon fontSize='small' />}>
      {render_parameters()}
      {render_result()}
    </BaseToolComponent>
  )
}

GenericToolComponent.propTypes = {
  tool_call_event: PropTypes.object.isRequired,
  tool_result_event: PropTypes.object
}

export default GenericToolComponent
