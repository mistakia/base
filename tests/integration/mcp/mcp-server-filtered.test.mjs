import { describe, it, beforeEach } from 'mocha'
import { expect } from 'chai'

import { create_mcp_server } from '#libs-server/mcp/server.mjs'
import { list_tools } from '#libs-server/tools/index.mjs'

describe('MCP Server with Tool Filtering', function () {
  let all_available_tools

  beforeEach(function () {
    // Get all available tools for testing
    all_available_tools = list_tools()
  })

  describe('create_mcp_server', function () {
    it('should create server with all tools when no whitelist provided', async function () {
      const server = create_mcp_server()

      expect(server).to.be.an('object')
      expect(server).to.have.property('connect')
      expect(typeof server.connect).to.equal('function')
    })

    it('should create server with filtered tools', async function () {
      // Use a subset of available tools for testing
      const tool_whitelist = all_available_tools
        .slice(0, 2)
        .map((tool) => tool.name)
      const server = create_mcp_server({ tool_whitelist })

      expect(server).to.be.an('object')
      expect(server).to.have.property('connect')
      expect(typeof server.connect).to.equal('function')
    })

    it('should handle empty whitelist gracefully', async function () {
      const server = create_mcp_server({ tool_whitelist: [] })

      expect(server).to.be.an('object')
      expect(server).to.have.property('connect')
      expect(typeof server.connect).to.equal('function')
    })

    it('should handle non-existent tools in whitelist', async function () {
      const tool_whitelist = ['non_existent_tool_1', 'non_existent_tool_2']
      const server = create_mcp_server({ tool_whitelist })

      expect(server).to.be.an('object')
      expect(server).to.have.property('connect')
      expect(typeof server.connect).to.equal('function')
    })

    it('should handle mixed existing and non-existent tools', async function () {
      if (all_available_tools.length > 0) {
        const tool_whitelist = [
          all_available_tools[0].name, // Existing tool
          'non_existent_tool' // Non-existent tool
        ]
        const server = create_mcp_server({ tool_whitelist })

        expect(server).to.be.an('object')
        expect(server).to.have.property('connect')
        expect(typeof server.connect).to.equal('function')
      } else {
        this.skip('No tools available for testing')
      }
    })
  })

  describe('server request handlers', function () {
    let server

    beforeEach(function () {
      // Setup for server request handler tests
    })

    it('should handle tools/list request with filtered tools', async function () {
      if (all_available_tools.length >= 2) {
        const tool_whitelist = [
          all_available_tools[0].name,
          all_available_tools[1].name
        ]
        server = create_mcp_server({ tool_whitelist })

        // Mock the request handler invocation
        const handlers = []
        server.setRequestHandler = (schema, handler) => {
          handlers.push({ schema, handler })
        }

        // Re-create server to capture handlers
        server = create_mcp_server({ tool_whitelist })

        // Find the tools/list handler
        const tools_list_handler = handlers.find(
          (h) =>
            h.schema && h.schema._def && h.schema._def.value === 'tools/list'
        )

        if (tools_list_handler) {
          const response = await tools_list_handler.handler({
            method: 'tools/list'
          })

          expect(response).to.have.property('tools')
          expect(response.tools).to.be.an('array')
          expect(response.tools.length).to.equal(2)

          const returned_tool_names = response.tools.map((tool) => tool.name)
          expect(returned_tool_names).to.include(all_available_tools[0].name)
          expect(returned_tool_names).to.include(all_available_tools[1].name)
        }
      } else {
        this.skip('Not enough tools available for testing')
      }
    })

    it('should handle initialize request with filtered capabilities', async function () {
      if (all_available_tools.length >= 1) {
        const tool_whitelist = [all_available_tools[0].name]
        server = create_mcp_server({ tool_whitelist })

        // Mock the request handler invocation
        const handlers = []
        server.setRequestHandler = (schema, handler) => {
          handlers.push({ schema, handler })
        }

        // Re-create server to capture handlers
        server = create_mcp_server({ tool_whitelist })

        // Find the initialize handler
        const initialize_handler = handlers.find(
          (h) =>
            h.schema && h.schema._def && h.schema._def.value === 'initialize'
        )

        if (initialize_handler) {
          const response = await initialize_handler.handler({
            method: 'initialize',
            params: {
              protocolVersion: '2024-11-05'
            }
          })

          expect(response).to.have.property('capabilities')
          expect(response.capabilities).to.have.property('tools')

          const tool_names = Object.keys(response.capabilities.tools)
          expect(tool_names).to.include(all_available_tools[0].name)
          expect(tool_names.length).to.equal(1)
        }
      } else {
        this.skip('No tools available for testing')
      }
    })
  })
})
