import { expect } from 'chai'
import path from 'path'
import fs from 'fs/promises'

import {
  create_tool_call_entry,
  create_tool_result_entry,
  link_tool_call_to_result,
  validate_tool_call_entry,
  validate_tool_result_entry,
  find_orphaned_tool_calls,
  find_orphaned_tool_results,
  extract_tool_interactions
} from '#libs-server/integrations/shared/tool-extraction-utils.mjs'

import { normalize_claude_session } from '#libs-server/integrations/claude/normalize-session.mjs'
import { normalize_chatgpt_conversation } from '#libs-server/integrations/chatgpt/normalize-session.mjs'
import { normalize_cursor_conversation } from '#libs-server/integrations/cursor/normalize-session.mjs'
import { build_timeline_from_session } from '#libs-server/integrations/thread/build-timeline-entries.mjs'
import { read_timeline_jsonl } from '#libs-server/threads/timeline/index.mjs'

describe('Tool Extraction Integration Tests', () => {
  describe('Shared Tool Extraction Utilities', () => {
    describe('create_tool_call_entry', () => {
      it('should create valid tool call entry with required fields', () => {
        const entry = create_tool_call_entry({
          parent_id: 'parent-123',
          tool_name: 'test_tool',
          tool_parameters: { param1: 'value1' },
          tool_call_id: 'call-456',
          timestamp: new Date('2024-01-01T12:00:00Z'),
          provider_data: { test: true },
          block_index: 0,
          line_number: 1
        })

        expect(entry.type).to.equal('tool_call')
        expect(entry.content.tool_name).to.equal('test_tool')
        expect(entry.content.tool_call_id).to.equal('call-456')
        expect(entry.content.execution_status).to.equal('pending')
        expect(entry.content.tool_parameters).to.deep.equal({
          param1: 'value1'
        })
        expect(entry.ordering.parent_id).to.equal('parent-123')
      })

      it('uses provided required parameters', () => {
        const entry = create_tool_call_entry({
          parent_id: 'parent-123',
          tool_name: 'test_tool',
          tool_call_id: 'call-456',
          timestamp: '2024-01-01T12:00:00.000Z',
          block_index: 0,
          line_number: 1
        })

        expect(entry.type).to.equal('tool_call')
        expect(entry.content.tool_parameters).to.deep.equal({})
        expect(entry.timestamp).to.exist
      })

      it('should return null for missing required parameters', () => {
        const entry = create_tool_call_entry({
          parent_id: 'parent-123',
          tool_name: 'test_tool'
          // missing tool_call_id
        })

        expect(entry).to.be.null
      })
    })

    describe('create_tool_result_entry', () => {
      it('should create valid tool result entry', () => {
        const entry = create_tool_result_entry({
          tool_call_id: 'call-456',
          result: 'execution completed',
          timestamp: new Date('2024-01-01T12:01:00Z'),
          provider_data: { test: true },
          block_index: 0,
          line_number: 1
        })

        expect(entry.type).to.equal('tool_result')
        expect(entry.content.tool_call_id).to.equal('call-456')
        expect(entry.content.result).to.equal('execution completed')
        expect(entry.content.error).to.be.undefined
      })

      it('should handle error results', () => {
        const entry = create_tool_result_entry({
          tool_call_id: 'call-456',
          error: 'execution failed',
          timestamp: '2024-01-01T12:01:00.000Z',
          block_index: 0,
          line_number: 1
        })

        expect(entry.content.error).to.equal('execution failed')
        expect(entry.content.result).to.be.null
      })

      it('should return null for missing tool_call_id', () => {
        const entry = create_tool_result_entry({
          result: 'some result'
        })

        expect(entry).to.be.null
      })
    })

    describe('Validation functions', () => {
      it('should validate correct tool call entry', () => {
        const entry = create_tool_call_entry({
          parent_id: 'parent-123',
          tool_name: 'test_tool',
          tool_call_id: 'call-456',
          timestamp: '2024-01-01T12:00:00.000Z',
          block_index: 0,
          line_number: 1
        })

        const errors = validate_tool_call_entry(entry)
        expect(errors.length).to.equal(0)
      })

      it('should validate correct tool result entry', () => {
        const entry = create_tool_result_entry({
          tool_call_id: 'call-456',
          result: 'success',
          timestamp: '2024-01-01T12:00:00.000Z',
          block_index: 0,
          line_number: 1
        })

        const errors = validate_tool_result_entry(entry)
        expect(errors.length).to.equal(0)
      })

      it('should detect validation errors', () => {
        const errors = validate_tool_call_entry({
          type: 'wrong_type',
          content: {}
        })

        expect(errors.length).to.be.greaterThan(0)
      })
    })

    describe('Tool interaction linking', () => {
      it('should find orphaned tool calls and results', () => {
        const ts = '2024-01-01T12:00:00.000Z'
        const timeline_entries = [
          create_tool_call_entry({
            parent_id: 'parent-1',
            tool_name: 'tool1',
            tool_call_id: 'call-1',
            timestamp: ts,
            block_index: 0,
            line_number: 1
          }),
          create_tool_call_entry({
            parent_id: 'parent-2',
            tool_name: 'tool2',
            tool_call_id: 'call-2',
            timestamp: ts,
            block_index: 0,
            line_number: 2
          }),
          create_tool_result_entry({
            tool_call_id: 'call-1',
            result: 'result1',
            timestamp: ts,
            block_index: 0,
            line_number: 3
          }),
          create_tool_result_entry({
            tool_call_id: 'call-orphaned',
            result: 'orphaned result',
            timestamp: ts,
            block_index: 0,
            line_number: 4
          })
        ].filter(Boolean) // Remove any null entries

        const orphaned_calls = find_orphaned_tool_calls(timeline_entries)
        const orphaned_results = find_orphaned_tool_results(timeline_entries)

        expect(orphaned_calls.length).to.equal(1)
        expect(orphaned_calls[0].content.tool_call_id).to.equal('call-2')
        expect(orphaned_results.length).to.equal(1)
        expect(orphaned_results[0].content.tool_call_id).to.equal(
          'call-orphaned'
        )
      })

      it('should link tool call to result and set status', () => {
        const tool_call_entry = create_tool_call_entry({
          parent_id: 'parent-123',
          tool_name: 'link_test_tool',
          tool_call_id: 'call-link-1',
          timestamp: '2024-01-01T12:00:00.000Z',
          block_index: 0,
          line_number: 1
        })

        const tool_result_entry = create_tool_result_entry({
          tool_call_id: 'call-link-1',
          result: 'result payload string with more than 20 chars',
          timestamp: '2024-01-01T12:00:00.000Z',
          block_index: 0,
          line_number: 2
        })

        const linked = link_tool_call_to_result(
          tool_call_entry,
          tool_result_entry
        )
        expect(linked).to.equal(true)
        expect(tool_call_entry.content.execution_status).to.equal('completed')
      })
    })

    describe('extract_tool_interactions', () => {
      it('should extract tool interactions and filter content', () => {
        const content_array = [
          { type: 'text', text: 'start' },
          {
            type: 'tool_use',
            name: 'test_tool',
            id: 'call-xyz',
            input: { a: 1 }
          },
          { type: 'text', text: 'middle' },
          { type: 'tool_result', tool_use_id: 'call-xyz', content: 'done' }
        ]

        const parent_entry = {
          id: 'msg-xyz',
          timestamp: new Date('2024-01-01T12:00:00Z'),
          provider_data: { line_number: 1 }
        }

        const provider_config = {
          shouldExtractAsTool: (content_item) =>
            content_item &&
            typeof content_item === 'object' &&
            (content_item.type === 'tool_use' ||
              content_item.type === 'tool_result'),
          extractToolData: (content_item) => {
            if (content_item.type === 'tool_use') {
              return {
                type: 'tool_call',
                tool_name: content_item.name,
                tool_parameters: content_item.input || {},
                tool_call_id: content_item.id
              }
            }
            return {
              type: 'tool_result',
              tool_call_id: content_item.tool_use_id,
              result: content_item.content
            }
          },
          createToolSummary: (tool_data) => `Tool: ${tool_data.tool_name}`,
          createResultSummary: () => 'Tool execution result'
        }

        const { tool_calls, tool_results, filtered_content } =
          extract_tool_interactions(
            content_array,
            parent_entry,
            provider_config
          )

        expect(tool_calls.length).to.equal(1)
        expect(tool_results.length).to.equal(1)
        expect(tool_calls[0].content.tool_name).to.equal('test_tool')
        expect(tool_calls[0].content.tool_call_id).to.equal('call-xyz')
        expect(tool_results[0].content.tool_call_id).to.equal('call-xyz')

        // original 4 items -> 2 tool items replaced by summaries => still 4 items
        expect(Array.isArray(filtered_content)).to.be.true
        expect(filtered_content.length).to.equal(4)
        // first and third positions remain text
        expect(filtered_content[0].type).to.equal('text')
        expect(filtered_content[2].type).to.equal('text')
      })
    })
  })

  describe('Provider-Specific Tool Extraction', () => {
    describe('Claude Provider', () => {
      it('should extract tool_use blocks as separate timeline entries', () => {
        const claude_session = {
          session_id: 'test-session',
          entries: [
            {
              uuid: 'msg-1',
              timestamp: '2024-01-01T12:00:00Z',
              type: 'assistant',
              line_number: 1,
              message: {
                content: [
                  {
                    type: 'text',
                    text: 'I will help you with that.'
                  },
                  {
                    type: 'tool_use',
                    name: 'file_read',
                    id: 'tool-call-1',
                    input: { path: '/test/file.txt' }
                  }
                ]
              }
            }
          ],
          metadata: {}
        }

        const result = normalize_claude_session(claude_session)

        // Should have both the original message and the extracted tool call
        const tool_calls = result.messages.filter(
          (msg) => msg.type === 'tool_call'
        )
        expect(tool_calls.length).to.equal(1)
        expect(tool_calls[0].content.tool_name).to.equal('file_read')
        expect(tool_calls[0].content.tool_call_id).to.equal('tool-call-1')
        expect(tool_calls[0].content.tool_parameters).to.deep.equal({
          path: '/test/file.txt'
        })
      })

      it('should extract tool_result blocks as separate timeline entries', () => {
        const claude_session = {
          session_id: 'test-session',
          entries: [
            {
              uuid: 'msg-2',
              timestamp: '2024-01-01T12:01:00Z',
              type: 'user',
              line_number: 2,
              message: {
                content: [
                  {
                    type: 'tool_result',
                    tool_use_id: 'tool-call-1',
                    content: 'File content here'
                  }
                ]
              }
            }
          ],
          metadata: {}
        }

        const result = normalize_claude_session(claude_session)

        const tool_results = result.messages.filter(
          (msg) => msg.type === 'tool_result'
        )
        expect(tool_results.length).to.equal(1)
        expect(tool_results[0].content.tool_call_id).to.equal('tool-call-1')
        expect(tool_results[0].content.result).to.equal('File content here')
      })

      it('should extract tool_use with metadata format', () => {
        const claude_session = {
          session_id: 'test-session',
          entries: [
            {
              uuid: 'msg-1',
              timestamp: '2024-01-01T12:00:00Z',
              type: 'assistant',
              line_number: 1,
              message: {
                content: [
                  {
                    type: 'text',
                    text: 'I will use a tool.'
                  },
                  {
                    type: 'tool_use',
                    content: 'Tool: TodoWrite',
                    metadata: {
                      tool_name: 'TodoWrite',
                      tool_id: 'toolu_01YCoW13nJZmDVQkzQids5ZN',
                      parameters: { todos: [] }
                    }
                  }
                ]
              }
            }
          ],
          metadata: {}
        }

        const result = normalize_claude_session(claude_session)

        const tool_calls = result.messages.filter(
          (msg) => msg.type === 'tool_call'
        )
        expect(tool_calls.length).to.equal(1)
        expect(tool_calls[0].content.tool_name).to.equal('TodoWrite')
        expect(tool_calls[0].content.tool_call_id).to.equal(
          'toolu_01YCoW13nJZmDVQkzQids5ZN'
        )
        expect(tool_calls[0].content.tool_parameters).to.deep.equal({
          todos: []
        })
      })

      it('should filter out tool blocks from message content', () => {
        const claude_session = {
          session_id: 'test-session',
          entries: [
            {
              uuid: 'msg-1',
              timestamp: '2024-01-01T12:00:00Z',
              type: 'assistant',
              line_number: 1,
              message: {
                content: [
                  {
                    type: 'text',
                    text: 'I will use a tool.'
                  },
                  {
                    type: 'tool_use',
                    name: 'test_tool',
                    id: 'tool-1',
                    input: {}
                  }
                ]
              }
            }
          ],
          metadata: {}
        }

        const result = normalize_claude_session(claude_session)
        const main_message = result.messages.find(
          (msg) => msg.type === 'message'
        )

        // Tool use should be filtered out, only text content should remain
        expect(Array.isArray(main_message.content)).to.be.true
        expect(main_message.content.length).to.equal(1)
        expect(main_message.content[0]).to.equal('I will use a tool.')
      })
    })

    describe('ChatGPT Provider', () => {
      it('should extract tool_invocation content as tool_call entries', () => {
        const chatgpt_conversation = {
          id: 'test-conversation',
          mapping: {
            root: {
              message: null,
              children: ['msg-1']
            },
            'msg-1': {
              message: {
                id: 'msg-1',
                create_time: 1704110400,
                content: {
                  content_type: 'tool_invocation',
                  tool_name: 'code_interpreter',
                  parameters: { code: 'print("hello")' },
                  invocation_id: 'inv-1'
                }
              },
              children: []
            }
          }
        }

        const result = normalize_chatgpt_conversation(chatgpt_conversation)

        const tool_calls = result.messages.filter(
          (msg) => msg.type === 'tool_call'
        )
        expect(tool_calls.length).to.equal(1)
        expect(tool_calls[0].content.tool_name).to.equal('code_interpreter')
        expect(tool_calls[0].content.tool_call_id).to.equal('inv-1')
        expect(tool_calls[0].content.tool_parameters).to.deep.equal({
          code: 'print("hello")'
        })
      })

      it('should extract execution_output content as tool_result entries', () => {
        const chatgpt_conversation = {
          id: 'test-conversation',
          mapping: {
            root: {
              message: null,
              children: ['msg-1']
            },
            'msg-1': {
              message: {
                id: 'msg-1',
                create_time: 1704110400,
                content: {
                  content_type: 'execution_output',
                  text: 'hello',
                  output: 'hello'
                },
                metadata: {
                  parent_id: 'inv-1'
                }
              },
              children: []
            }
          }
        }

        const result = normalize_chatgpt_conversation(chatgpt_conversation)

        const tool_results = result.messages.filter(
          (msg) => msg.type === 'tool_result'
        )
        expect(tool_results.length).to.equal(1)
        expect(tool_results[0].content.tool_call_id).to.equal('inv-1')
        expect(tool_results[0].content.result).to.equal('hello')
      })
    })

    describe('Cursor Provider', () => {
      it('should extract capability_type messages as tool calls', () => {
        const cursor_conversation = {
          composer_id: 'test-cursor',
          messages: [
            {
              id: 'msg-1',
              role: 'assistant',
              timestamp: '2024-01-01T12:00:00Z',
              capability_type: 'code_interpreter',
              content: 'Running code interpreter'
            }
          ]
        }

        const result = normalize_cursor_conversation(cursor_conversation)

        const tool_calls = result.messages.filter(
          (msg) => msg.type === 'tool_call'
        )
        expect(tool_calls.length).to.equal(1)
        expect(tool_calls[0].content.tool_name).to.equal('code_interpreter')
      })

      it('should extract tool role messages as tool results', () => {
        const cursor_conversation = {
          composer_id: 'test-cursor',
          messages: [
            {
              id: 'msg-1',
              role: 'tool',
              timestamp: '2024-01-01T12:01:00Z',
              content: 'Tool execution result'
            }
          ]
        }

        const result = normalize_cursor_conversation(cursor_conversation)

        const tool_results = result.messages.filter(
          (msg) => msg.type === 'tool_result'
        )
        expect(tool_results.length).to.equal(1)
        expect(tool_results[0].content.result).to.equal('Tool execution result')
      })
    })
  })

  describe('Timeline Builder Integration', () => {
    let temp_dir

    before(async () => {
      // Create temporary directory for test files. metadata.json must exist
      // before build_timeline_from_session is allowed to write a sibling
      // timeline.jsonl -- it is the thread directory's lifecycle anchor.
      temp_dir = path.join(process.cwd(), 'tmp', 'tool-extraction-tests')
      await fs.mkdir(temp_dir, { recursive: true })
      await fs.writeFile(
        path.join(temp_dir, 'metadata.json'),
        JSON.stringify({ thread_id: 'test-thread' })
      )
    })

    after(async () => {
      // Clean up temporary directory
      try {
        await fs.rm(temp_dir, { recursive: true, force: true })
      } catch (error) {
        // Ignore cleanup errors
      }
    })

    it('should build timeline with tool call and result entries', async () => {
      const normalized_session = {
        session_id: 'test-session',
        session_provider: 'claude',
        parse_mode: 'full',
        messages: [
          {
            id: 'msg-1',
            type: 'message',
            role: 'user',
            content: 'Please read a file',
            timestamp: new Date('2024-01-01T12:00:00Z'),
            provider_data: { line_number: 1 }
          },
          {
            id: 'tool-call-1',
            type: 'tool_call',
            timestamp: new Date('2024-01-01T12:00:30Z'),
            content: {
              tool_name: 'file_read',
              tool_parameters: { path: '/test.txt' },
              tool_call_id: 'call-1',
              execution_status: 'pending'
            },
            ordering: { parent_id: 'msg-1' },
            provider_data: { is_extracted_tool: true }
          },
          {
            id: 'tool-result-1',
            type: 'tool_result',
            timestamp: new Date('2024-01-01T12:00:45Z'),
            content: {
              tool_call_id: 'call-1',
              result: 'File contents here'
            },
            provider_data: { is_extracted_tool: true }
          }
        ]
      }

      const thread_info = {
        thread_id: 'test-thread',
        thread_dir: temp_dir
      }

      const result = await build_timeline_from_session(
        normalized_session,
        thread_info
      )

      expect(result.entry_count).to.equal(3)
      expect(result.tool_validation).to.exist
      expect(result.tool_validation.tool_call_count).to.equal(1)
      expect(result.tool_validation.tool_result_count).to.equal(1)
      expect(result.tool_validation.linked_pairs_count).to.equal(1)
      expect(result.tool_validation.linking_success_rate).to.equal(1)

      // Verify timeline file was created
      const timeline_path = path.join(temp_dir, 'timeline.jsonl')
      const timeline = await read_timeline_jsonl({ timeline_path })

      const tool_call_entry = timeline.find(
        (entry) => entry.type === 'tool_call'
      )
      expect(tool_call_entry).to.exist
      expect(tool_call_entry.content.tool_name).to.equal('file_read')
      expect(tool_call_entry.content.tool_call_id).to.equal('call-1')

      const tool_result_entry = timeline.find(
        (entry) => entry.type === 'tool_result'
      )
      expect(tool_result_entry).to.exist
      expect(tool_result_entry.content.tool_call_id).to.equal('call-1')
      expect(tool_result_entry.content.result).to.equal('File contents here')
    })

    it('should detect orphaned tool calls and results', async () => {
      const normalized_session = {
        session_id: 'test-session-orphaned',
        session_provider: 'test',
        parse_mode: 'full',
        messages: [
          {
            id: 'tool-call-orphaned',
            type: 'tool_call',
            timestamp: new Date('2024-01-01T12:00:00Z'),
            content: {
              tool_name: 'orphaned_tool',
              tool_parameters: {},
              tool_call_id: 'orphaned-call',
              execution_status: 'pending'
            }
          },
          {
            id: 'tool-result-orphaned',
            type: 'tool_result',
            timestamp: new Date('2024-01-01T12:01:00Z'),
            content: {
              tool_call_id: 'different-call-id',
              result: 'orphaned result'
            }
          }
        ]
      }

      const thread_info = {
        thread_id: 'test-thread-orphaned',
        thread_dir: temp_dir
      }

      const result = await build_timeline_from_session(
        normalized_session,
        thread_info
      )

      expect(result.tool_validation.orphaned_calls.length).to.equal(1)
      expect(result.tool_validation.orphaned_results.length).to.equal(1)
      expect(result.tool_validation.linked_pairs_count).to.equal(0)
      expect(result.tool_validation.linking_success_rate).to.equal(0)
    })
  })

  describe('Schema Compliance', () => {
    it('should create timeline entries that validate against thread schema', () => {
      const tool_call = create_tool_call_entry({
        parent_id: 'parent-123',
        tool_name: 'test_tool',
        tool_call_id: 'call-456',
        timestamp: '2024-01-01T12:00:00.000Z',
        block_index: 0,
        line_number: 1
      })

      const tool_result = create_tool_result_entry({
        tool_call_id: 'call-456',
        result: 'success',
        timestamp: '2024-01-01T12:00:00.000Z',
        block_index: 0,
        line_number: 2
      })

      // Basic schema validation - entries should have required fields
      expect(tool_call.id).to.exist
      expect(tool_call.timestamp).to.exist
      expect(tool_call.type).to.equal('tool_call')
      expect(tool_call.content).to.exist
      expect(tool_call.content.tool_name).to.exist
      expect(tool_call.content.tool_call_id).to.exist
      expect(tool_call.content.tool_parameters).to.exist

      expect(tool_result.id).to.exist
      expect(tool_result.timestamp).to.exist
      expect(tool_result.type).to.equal('tool_result')
      expect(tool_result.content).to.exist
      expect(tool_result.content.tool_call_id).to.exist
      expect(tool_result.content.result).to.not.be.undefined
    })
  })

  describe('Backward Compatibility', () => {
    it('should handle sessions without tool interactions', () => {
      const claude_session = {
        session_id: 'no-tools-session',
        entries: [
          {
            uuid: 'msg-1',
            timestamp: '2024-01-01T12:00:00Z',
            type: 'user',
            line_number: 1,
            message: {
              content: [
                {
                  type: 'text',
                  text: 'Hello, how are you?'
                }
              ]
            }
          },
          {
            uuid: 'msg-2',
            timestamp: '2024-01-01T12:00:30Z',
            type: 'assistant',
            line_number: 2,
            message: {
              content: [
                {
                  type: 'text',
                  text: 'I am doing well, thank you!'
                }
              ]
            }
          }
        ],
        metadata: {}
      }

      const result = normalize_claude_session(claude_session)

      // Should only have message entries, no tool entries
      expect(result.messages.length).to.equal(2)
      expect(result.messages.every((msg) => msg.type === 'message')).to.be.true
    })

    it('should maintain existing message structure', () => {
      const claude_session = {
        session_id: 'mixed-session',
        entries: [
          {
            uuid: 'msg-1',
            timestamp: '2024-01-01T12:00:00Z',
            type: 'assistant',
            line_number: 1,
            message: {
              content: [
                {
                  type: 'text',
                  text: 'I will help you.'
                },
                {
                  type: 'tool_use',
                  name: 'helper_tool',
                  id: 'tool-1',
                  input: { param: 'value' }
                },
                {
                  type: 'text',
                  text: 'Tool completed successfully.'
                }
              ]
            }
          }
        ],
        metadata: {}
      }

      const result = normalize_claude_session(claude_session)

      // Should have both message and tool_call entries
      const message_entries = result.messages.filter(
        (msg) => msg.type === 'message'
      )
      const tool_entries = result.messages.filter(
        (msg) => msg.type === 'tool_call'
      )

      expect(message_entries.length).to.equal(1)
      expect(tool_entries.length).to.equal(1)

      // Message content should have tool_use filtered out
      const message_content = message_entries[0].content
      expect(Array.isArray(message_content)).to.be.true
      expect(message_content.length).to.equal(2)
      expect(message_content[0]).to.equal('I will help you.')
      expect(message_content[1]).to.equal('Tool completed successfully.')
    })
  })
})
