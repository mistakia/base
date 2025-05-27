/**
 * Format a response for the MCP protocol
 * @param {any} data - The data to format
 * @param {boolean} is_error - Whether this is an error response
 * @returns {object} Formatted response
 */
export function format_response(data, is_error = false) {
  return {
    isError: is_error,
    content: [
      {
        type: 'text',
        text: JSON.stringify(data, null, 2)
      }
    ]
  }
}

/**
 * Format an error response
 * @param {string} tool_name - The name of the tool that failed
 * @param {Error} error - The error object
 * @returns {object} Formatted error response
 */
export function format_error(tool_name, error) {
  return format_response(`Error executing ${tool_name}: ${error.message}`, true)
}
