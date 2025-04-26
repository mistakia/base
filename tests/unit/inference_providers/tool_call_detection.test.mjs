import { expect } from 'chai'
import { describe, it } from 'mocha'

// Import the correct class, InferenceProvider instead of BaseProvider
import { InferenceProvider } from '#libs-server/inference_providers/index.mjs'

describe('Tool Call Detection', () => {
  // Create a provider instance to test the tool call detection
  const provider = new InferenceProvider({
    provider_config: {},
    provider_credentials: {}
  })

  describe('find_tool_calls', () => {
    it('should detect tool calls in ```tool_call format', () => {
      const text = `Here's some text before.
\`\`\`tool_call
{
  "name": "function_name",
  "arguments": {
    "param1": "value1",
    "param2": "value2"
  }
}
\`\`\`
And some text after.`

      const { tool_calls, next_id } = provider.find_tool_calls(text)

      expect(tool_calls).to.be.an('array')
      expect(tool_calls.length).to.equal(1)
      expect(tool_calls[0]).to.deep.include({
        tool_name: 'function_name',
        tool_params: {
          param1: 'value1',
          param2: 'value2'
        }
      })
    })

    it('should detect multiple tool calls in ```tool_call format', () => {
      const text = `First tool:
\`\`\`tool_call
{
  "name": "first_function",
  "arguments": {
    "param1": "value1"
  }
}
\`\`\`
Second tool:
\`\`\`tool_call
{
  "name": "second_function",
  "arguments": {
    "param2": "value2"
  }
}
\`\`\`
Some text between`

      const { tool_calls, next_id } = provider.find_tool_calls(text)

      expect(tool_calls).to.be.an('array')
      expect(tool_calls.length).to.equal(2)
      expect(tool_calls[0].tool_name).to.equal('first_function')
      expect(tool_calls[1].tool_name).to.equal('second_function')
    })

    it('should still detect legacy <tool_call> format', () => {
      const text = `Legacy format: 
<tool_call>
{
  "name": "legacy_function",
  "arguments": {
    "param": "value"
  }
}
</tool_call>`

      const { tool_calls, next_id } = provider.find_tool_calls(text)

      expect(tool_calls).to.be.an('array')
      expect(tool_calls.length).to.equal(1)
      expect(tool_calls[0].tool_name).to.equal('legacy_function')
    })

    it('should properly continue ID counting across multiple calls', () => {
      const first_text =
        '```tool_call\n{"name": "first_tool", "arguments": {}}\n```'
      const { next_id } = provider.find_tool_calls(first_text)

      const second_text =
        '```tool_call\n{"name": "second_tool", "arguments": {}}\n```'
      const result = provider.find_tool_calls(second_text, next_id)

      expect(result.tool_calls[0].id).to.equal(`tool_call_${next_id}`)
    })

    it('should ignore invalid JSON in tool call blocks', () => {
      const text = `\`\`\`tool_call
This is not valid JSON
\`\`\``

      const { tool_calls } = provider.find_tool_calls(text)
      expect(tool_calls.length).to.equal(0)
    })

    it('should ignore valid JSON without name property', () => {
      const text = `\`\`\`tool_call
{
  "not_name": "function_name",
  "arguments": {}
}
\`\`\``

      const { tool_calls } = provider.find_tool_calls(text)
      expect(tool_calls.length).to.equal(0)
    })
  })
})
