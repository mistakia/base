import debug from 'debug'
import {
  list_tools,
  tool_to_prompt_function
} from '#libs-server/tools/registry.mjs'

const log = debug('prompts:tools')

/**
 * Generate a tools prompt component with tool definitions in function format
 * All tools are wrapped in <functions></functions> tags
 *
 * @param {Object} params Parameters
 * @param {Array<string>} [params.tool_names] Specific tool names to include
 * @param {boolean} [params.include_all=false] Whether to include all registered tools
 * @returns {Promise<string>} Generated tools component in function format
 */
export default async function generate_tools_prompt({
  tool_names = [],
  include_all = false
}) {
  log('Generating tools prompt')

  let tools_to_include = []

  // If specific tools are requested, use those
  if (tool_names && tool_names.length > 0) {
    log(`Including specific tools: ${tool_names.join(', ')}`)
    tools_to_include = tool_names
  } else if (include_all) {
    log('Including all registered tools')
    tools_to_include = await list_tools()
    // If we have a list of tool objects, extract just the names
    if (
      tools_to_include.length > 0 &&
      typeof tools_to_include[0] === 'object'
    ) {
      tools_to_include = tools_to_include.map((tool) => tool.name)
    }
  } else {
    log('No tools specified and include_all is false')
    return ''
  }

  return generate_function_tools_definition(tools_to_include)
}

/**
 * Generate function format tool definitions
 * All functions are wrapped in <functions></functions> tags
 *
 * @param {Array<string>} tool_names Tool names to include
 * @returns {Promise<string>} Function-formatted tool definitions
 */
async function generate_function_tools_definition(tool_names) {
  const function_defs = []

  for (const tool_name of tool_names) {
    try {
      const function_def = tool_to_prompt_function({ tool_name })

      if (function_def) {
        // Format as <function>JSON</function>
        const json_string = JSON.stringify(function_def)
        function_defs.push(`<function>${json_string}</function>`)
      }
    } catch (error) {
      log(
        `Error converting tool ${tool_name} to function format: ${error.message}`
      )
      // Skip this tool but continue with others
    }
  }

  // If no functions were generated, return empty string
  if (function_defs.length === 0) {
    return ''
  }

  // Wrap all functions in <functions></functions> tags
  return `<functions>\n${function_defs.join('\n')}\n</functions>`
}
