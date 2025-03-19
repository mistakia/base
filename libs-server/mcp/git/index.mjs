import { GIT_TOOLS } from './tools.mjs'
import './provider.mjs'

export { GIT_TOOLS }

export default {
  handle_request: async (request) => {
    // This function shouldn't be called directly since the provider
    // registers itself with the MCP service
    throw new Error('Use MCP service to call Git tools')
  }
}
