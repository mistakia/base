import debug from 'debug'
import { read_workflow_from_filesystem } from './filesystem/read-workflow-from-filesystem.mjs'

const log = debug('workflow:register-tools')

/**
 * Get the tools list for a workflow (uses tool names as-is)
 *
 * @param {Object} params Parameters
 * @param {string} params.workflow_base_uri Workflow path relative to Base root
 * @returns {Promise<Array<string>>} Array of tool names
 */
export async function get_workflow_tools({ workflow_base_uri }) {
  if (!workflow_base_uri) {
    return []
  }

  try {
    // Read the workflow to get tools list
    const workflow_result = await read_workflow_from_filesystem({
      base_uri: workflow_base_uri
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
