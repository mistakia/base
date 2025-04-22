import { expect } from 'chai'
import generate_tools_prompt from '#libs-server/prompts/generate_tools_prompt.mjs'
import { register_tool, list_tools } from '#libs-server/tools/registry.mjs'

describe('generate_tools_prompt', () => {
  // Register test tools before tests
  before(async () => {
    // Register first test tool
    register_tool({
      tool_name: 'test_tool1',
      tool_definition: {
        description: 'First test tool',
        inputSchema: {
          properties: {
            param1: { description: 'First parameter' },
            param2: { description: 'Second parameter' }
          },
          required: ['param1']
        }
      },
      implementation: async () => ({ result: 'tool1_result' })
    })

    // Register second test tool
    register_tool({
      tool_name: 'test_tool2',
      tool_definition: {
        description: 'Second test tool',
        inputSchema: {
          properties: {
            param3: { description: 'Third parameter' }
          }
        }
      },
      implementation: async () => ({ result: 'tool2_result' })
    })

    // Verify tools are registered
    const registered_tools = await list_tools()
    expect(registered_tools).to.be.an('array')
    expect(registered_tools.some((tool) => tool.name === 'test_tool1')).to.be
      .true
    expect(registered_tools.some((tool) => tool.name === 'test_tool2')).to.be
      .true
  })

  describe('with include_all flag', () => {
    it('should generate tools definition for all tools', async () => {
      const result = await generate_tools_prompt({
        include_all: true
      })

      expect(result).to.be.a('string')
      // Check for outer wrapper
      expect(result).to.match(/^<functions>[\s\S]*<\/functions>$/)

      // Check for individual function tags
      expect(result).to.include('<function>')
      expect(result).to.include('</function>')

      // Should include both tools
      expect(result).to.include('"name":"test_tool1"')
      expect(result).to.include('"name":"test_tool2"')

      // Should include description and parameters
      expect(result).to.include('"description":"First test tool"')
      expect(result).to.include('"param1"')
      expect(result).to.include('"required":["param1"]')
    })
  })

  describe('with specific tools', () => {
    it('should generate tools definition for specific tools', async () => {
      const result = await generate_tools_prompt({
        tool_names: ['test_tool1']
      })

      expect(result).to.be.a('string')
      // Check for outer wrapper
      expect(result).to.match(/^<functions>[\s\S]*<\/functions>$/)

      expect(result).to.include('<function>')
      expect(result).to.include('</function>')
      expect(result).to.include('"name":"test_tool1"')
      expect(result).to.not.include('"name":"test_tool2"')
    })
  })

  describe('with no tools specified', () => {
    it('should return empty string when no tools specified and include_all is false', async () => {
      const result = await generate_tools_prompt({
        tool_names: [],
        include_all: false
      })

      expect(result).to.equal('')
    })
  })

  describe('with nonexistent tools', () => {
    it('should handle nonexistent tools', async () => {
      const result = await generate_tools_prompt({
        tool_names: ['nonexistent_tool', 'test_tool1']
      })

      expect(result).to.be.a('string')
      // Check for outer wrapper
      expect(result).to.match(/^<functions>[\s\S]*<\/functions>$/)

      expect(result).to.include('<function>')
      expect(result).to.include('"name":"test_tool1"')

      // Nonexistent tool should not be in the result
      expect(result).to.not.include('nonexistent_tool')
    })

    it('should return empty string when no valid tools are found', async () => {
      const result = await generate_tools_prompt({
        tool_names: ['nonexistent_tool1', 'nonexistent_tool2']
      })

      expect(result).to.equal('')
    })
  })
})
