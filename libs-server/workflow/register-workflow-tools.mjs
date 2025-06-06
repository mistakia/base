import debug from 'debug'
import { register_tool } from '#libs-server/tools/registry.mjs'
import { read_workflow_from_filesystem } from './filesystem/read-workflow-from-filesystem.mjs'

const log = debug('workflow:register-tools')

/**
 * Register workflow-defined custom tools with the tool registry
 *
 * @param {Object} params Parameters
 * @param {string} params.workflow_base_relative_path Workflow path relative to Base root
 * @param {string} [params.root_base_directory] Custom root base directory
 * @returns {Promise<Array<string>>} Array of scoped tool names that were registered
 */
export async function register_workflow_tools({
  workflow_base_relative_path,
  root_base_directory
}) {
  if (!workflow_base_relative_path) {
    return []
  }

  log(`Registering tools for workflow: ${workflow_base_relative_path}`)

  try {
    // Read the workflow to get tool definitions
    const workflow_result = await read_workflow_from_filesystem({
      base_relative_path: workflow_base_relative_path,
      root_base_directory
    })

    if (
      !workflow_result.success ||
      !workflow_result.entity_properties.tool_definition
    ) {
      log(
        `No custom tools to register for workflow: ${workflow_base_relative_path}`
      )
      return []
    }

    const registered_tool_names = []
    const tool_definition_map =
      workflow_result.entity_properties.tool_definition

    for (const [tool_name, tool_definition] of Object.entries(
      tool_definition_map
    )) {
      try {
        // Create tool definition for registry
        const registry_tool_definition = {
          description:
            tool_definition.description || `Custom workflow tool: ${tool_name}`,
          stops_execution: tool_definition.stops_execution !== false, // Default to true
          inputSchema: {
            type: 'object',
            properties: tool_definition.parameters?.properties || {},
            required: tool_definition.parameters?.required || []
          }
        }

        // Create implementation that returns the parameters and marks workflow completion
        const implementation = async (parameters, context) => {
          return {
            success: true,
            tool_name,
            parameters,
            workflow_completion: true,
            workflow_base_relative_path,
            result: parameters
          }
        }

        // Register the tool using the original tool name
        register_tool({
          tool_name,
          tool_definition: registry_tool_definition,
          implementation
        })

        registered_tool_names.push(tool_name)
        log(`Registered custom workflow tool: ${tool_name}`)
      } catch (tool_error) {
        log(
          `Warning: Could not register custom tool ${tool_name}: ${tool_error.message}`
        )
      }
    }

    return registered_tool_names
  } catch (error) {
    log(`Error registering workflow tools: ${error.message}`)
    return []
  }
}

/**
 * Get the tools list for a workflow (uses tool names as-is)
 *
 * @param {Object} params Parameters
 * @param {string} params.workflow_base_relative_path Workflow path relative to Base root
 * @param {string} [params.root_base_directory] Custom root base directory
 * @returns {Promise<Array<string>>} Array of tool names
 */
export async function get_workflow_tools({
  workflow_base_relative_path,
  root_base_directory
}) {
  if (!workflow_base_relative_path) {
    return []
  }

  try {
    // Read the workflow to get tools list
    const workflow_result = await read_workflow_from_filesystem({
      base_relative_path: workflow_base_relative_path,
      root_base_directory
    })

    if (!workflow_result.success || !workflow_result.entity_properties.tools) {
      return []
    }

    // Return workflow tools as-is (no scoping needed)
    return workflow_result.entity_properties.tools.filter(Boolean)
  } catch (error) {
    log(`Error getting workflow tools: ${error.message}`)
    return []
  }
}
