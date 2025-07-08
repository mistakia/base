import { describe, it, beforeEach } from 'mocha'
import { expect } from 'chai'

import { register_tool, list_tools } from '#libs-server/tools/registry.mjs'

describe('Tool Registry', function () {
  // Sample tool definitions for testing
  const test_tool_1 = {
    tool_name: 'test_tool_1',
    tool_definition: {
      description: 'First test tool',
      inputSchema: {
        type: 'object',
        properties: {
          param1: { type: 'string' }
        },
        required: ['param1']
      }
    },
    implementation: () => ({ result: 'test1' })
  }

  const test_tool_2 = {
    tool_name: 'test_tool_2',
    tool_definition: {
      description: 'Second test tool',
      inputSchema: {
        type: 'object',
        properties: {
          param2: { type: 'number' }
        },
        required: ['param2']
      }
    },
    implementation: () => ({ result: 'test2' })
  }

  const test_tool_3 = {
    tool_name: 'test_tool_3',
    tool_definition: {
      description: 'Third test tool',
      inputSchema: {
        type: 'object',
        properties: {
          param3: { type: 'boolean' }
        },
        required: ['param3']
      }
    },
    implementation: () => ({ result: 'test3' })
  }

  beforeEach(function () {
    // Register test tools
    register_tool(test_tool_1)
    register_tool(test_tool_2)
    register_tool(test_tool_3)
  })

  describe('list_tools', function () {
    it('should return all tools when no whitelist provided', function () {
      const result = list_tools({})
      const all_tools = list_tools()

      expect(result).to.be.an('array')
      expect(result.length).to.equal(all_tools.length)
      expect(result).to.deep.equal(all_tools)
    })

    it('should return all tools when whitelist is null', function () {
      const result = list_tools({ tool_whitelist: null })
      const all_tools = list_tools()

      expect(result).to.be.an('array')
      expect(result.length).to.equal(all_tools.length)
      expect(result).to.deep.equal(all_tools)
    })

    it('should return all tools when whitelist is not an array', function () {
      const result = list_tools({ tool_whitelist: 'not-an-array' })
      const all_tools = list_tools()

      expect(result).to.be.an('array')
      expect(result.length).to.equal(all_tools.length)
      expect(result).to.deep.equal(all_tools)
    })

    it('should filter tools by whitelist', function () {
      const whitelist = ['test_tool_1', 'test_tool_3']
      const result = list_tools({ tool_whitelist: whitelist })

      expect(result).to.be.an('array')
      expect(result.length).to.equal(2)

      const tool_names = result.map((tool) => tool.name)
      expect(tool_names).to.include('test_tool_1')
      expect(tool_names).to.include('test_tool_3')
      expect(tool_names).to.not.include('test_tool_2')
    })

    it('should return only existing tools from whitelist', function () {
      const whitelist = ['test_tool_1', 'non_existent_tool', 'test_tool_2']
      const result = list_tools({ tool_whitelist: whitelist })

      expect(result).to.be.an('array')
      expect(result.length).to.equal(2)

      const tool_names = result.map((tool) => tool.name)
      expect(tool_names).to.include('test_tool_1')
      expect(tool_names).to.include('test_tool_2')
      expect(tool_names).to.not.include('non_existent_tool')
    })

    it('should return empty array when no tools match whitelist', function () {
      const whitelist = ['non_existent_tool_1', 'non_existent_tool_2']
      const result = list_tools({ tool_whitelist: whitelist })

      expect(result).to.be.an('array')
      expect(result.length).to.equal(0)
    })

    it('should return empty array when whitelist is empty array', function () {
      const result = list_tools({ tool_whitelist: [] })

      expect(result).to.be.an('array')
      expect(result.length).to.equal(0)
    })

    it('should preserve tool metadata structure', function () {
      const whitelist = ['test_tool_1']
      const result = list_tools({ tool_whitelist: whitelist })

      expect(result).to.be.an('array')
      expect(result.length).to.equal(1)

      const tool = result[0]
      expect(tool).to.have.property('name', 'test_tool_1')
      expect(tool).to.have.property('description', 'First test tool')
      expect(tool).to.have.property('inputSchema')
      expect(tool.inputSchema).to.deep.equal({
        type: 'object',
        properties: {
          param1: { type: 'string' }
        },
        required: ['param1']
      })
    })
  })
})
