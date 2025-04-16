import React from 'react'
import PropTypes from 'prop-types'

const ToolCallDisplay = ({ tool_calls }) => {
  return (
    <div className='tool-call-display'>
      {tool_calls.map((call, index) => (
        <div key={index} className='tool-call'>
          <h4>{call.tool_name}</h4>
          <pre>{JSON.stringify(call.parameters, null, 2)}</pre>
        </div>
      ))}
    </div>
  )
}

ToolCallDisplay.propTypes = {
  tool_calls: PropTypes.arrayOf(
    PropTypes.shape({
      tool_name: PropTypes.string.isRequired,
      parameters: PropTypes.object.isRequired
    })
  ).isRequired
}

export default ToolCallDisplay
