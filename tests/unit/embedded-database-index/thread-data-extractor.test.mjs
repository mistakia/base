/* global describe, it */

import { expect } from 'chai'

import {
  extract_thread_entity_data,
  extract_thread_relations_for_kuzu,
  extract_edit_metrics_from_timeline
} from '#libs-server/embedded-database-index/sync/thread-data-extractor.mjs'

describe('thread-data-extractor', () => {
  describe('extract_thread_entity_data', () => {
    it('should extract entity data from thread metadata', () => {
      const result = extract_thread_entity_data({
        thread_id: 'abc-123',
        metadata: {
          title: 'Test Thread',
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-02T00:00:00Z',
          user_public_key: 'user-key-123'
        }
      })

      expect(result.thread_id).to.equal('abc-123')
      expect(result.title).to.equal('Test Thread')
      expect(result.created_at).to.equal('2025-01-01T00:00:00Z')
      expect(result.updated_at).to.equal('2025-01-02T00:00:00Z')
      expect(result.user_public_key).to.equal('user-key-123')
    })

    it('should return null for missing thread_id', () => {
      const result = extract_thread_entity_data({
        thread_id: null,
        metadata: { title: 'Test' }
      })

      expect(result).to.be.null
    })

    it('should return null for missing metadata', () => {
      const result = extract_thread_entity_data({
        thread_id: 'abc-123',
        metadata: null
      })

      expect(result).to.be.null
    })

    it('should handle missing optional fields', () => {
      const result = extract_thread_entity_data({
        thread_id: 'abc-123',
        metadata: {}
      })

      expect(result.thread_id).to.equal('abc-123')
      expect(result.title).to.be.null
      expect(result.created_at).to.be.null
    })
  })

  describe('extract_thread_relations_for_kuzu', () => {
    it('should parse relation strings in standard format', () => {
      const result = extract_thread_relations_for_kuzu({
        metadata: {
          relations: [
            'accesses [[user:task/my-task.md]]',
            'modifies [[user:text/document.md]]'
          ]
        }
      })

      expect(result).to.have.length(2)
      expect(result[0].target_base_uri).to.equal('user:task/my-task.md')
      expect(result[0].relation_type).to.equal('accesses')
      expect(result[1].target_base_uri).to.equal('user:text/document.md')
      expect(result[1].relation_type).to.equal('modifies')
    })

    it('should handle system URIs', () => {
      const result = extract_thread_relations_for_kuzu({
        metadata: {
          relations: ['implements [[sys:system/schema/task.md]]']
        }
      })

      expect(result).to.have.length(1)
      expect(result[0].target_base_uri).to.equal('sys:system/schema/task.md')
      expect(result[0].relation_type).to.equal('implements')
    })

    it('should return empty array for missing relations', () => {
      const result = extract_thread_relations_for_kuzu({
        metadata: {}
      })

      expect(result).to.deep.equal([])
    })

    it('should return empty array for null metadata', () => {
      const result = extract_thread_relations_for_kuzu({
        metadata: null
      })

      expect(result).to.deep.equal([])
    })

    it('should skip malformed relation strings', () => {
      const result = extract_thread_relations_for_kuzu({
        metadata: {
          relations: [
            'accesses [[user:task/valid.md]]',
            'not a valid relation',
            'missing_brackets user:task/task.md',
            'creates [[user:task/another.md]]'
          ]
        }
      })

      expect(result).to.have.length(2)
      expect(result[0].target_base_uri).to.equal('user:task/valid.md')
      expect(result[1].target_base_uri).to.equal('user:task/another.md')
    })

    it('should include empty context string', () => {
      const result = extract_thread_relations_for_kuzu({
        metadata: {
          relations: ['relates_to [[user:task/task.md]]']
        }
      })

      expect(result[0].context).to.equal('')
    })
  })

  describe('extract_edit_metrics_from_timeline', () => {
    it('should return zeros for empty timeline', () => {
      const result = extract_edit_metrics_from_timeline({ timeline: [] })

      expect(result.edit_count).to.equal(0)
      expect(result.lines_changed).to.equal(0)
    })

    it('should return zeros for null timeline', () => {
      const result = extract_edit_metrics_from_timeline({ timeline: null })

      expect(result.edit_count).to.equal(0)
      expect(result.lines_changed).to.equal(0)
    })

    it('should count Edit tool_result events', () => {
      const result = extract_edit_metrics_from_timeline({
        timeline: [
          {
            type: 'tool_result',
            tool_name: 'Edit',
            tool_input: {
              old_string: 'old text',
              new_string: 'new text that is longer'
            }
          },
          {
            type: 'tool_result',
            tool_name: 'Edit',
            tool_input: {
              old_string: 'another old',
              new_string: 'another new'
            }
          }
        ]
      })

      expect(result.edit_count).to.equal(2)
      expect(result.lines_changed).to.be.greaterThan(0)
    })

    it('should count Write tool_result events', () => {
      const result = extract_edit_metrics_from_timeline({
        timeline: [
          {
            type: 'tool_result',
            tool_name: 'Write',
            tool_input: {
              content: 'a'.repeat(160) // 160 chars = 2 lines
            }
          }
        ]
      })

      expect(result.edit_count).to.equal(1)
      expect(result.lines_changed).to.equal(2)
    })

    it('should ignore assistant tool_use blocks to avoid double-counting', () => {
      // Assistant tool_use blocks represent the request, not the result
      // Only tool_result events should be counted
      const result = extract_edit_metrics_from_timeline({
        timeline: [
          {
            type: 'assistant',
            content: [
              {
                type: 'tool_use',
                name: 'Edit',
                input: {
                  old_string: 'test',
                  new_string: 'test modified'
                }
              },
              {
                type: 'tool_use',
                name: 'Write',
                input: {
                  content: 'new file content'
                }
              }
            ]
          }
        ]
      })

      expect(result.edit_count).to.equal(0)
    })

    it('should ignore non-edit tools', () => {
      const result = extract_edit_metrics_from_timeline({
        timeline: [
          {
            type: 'tool_result',
            tool_name: 'Read',
            tool_input: { file_path: '/some/file.txt' }
          },
          {
            type: 'tool_result',
            tool_name: 'Bash',
            tool_input: { command: 'ls -la' }
          }
        ]
      })

      expect(result.edit_count).to.equal(0)
      expect(result.lines_changed).to.equal(0)
    })

    it('should calculate lines changed based on character count', () => {
      const content = 'x'.repeat(240) // 240 chars = 3 lines (at 80 chars/line)
      const result = extract_edit_metrics_from_timeline({
        timeline: [
          {
            type: 'tool_result',
            tool_name: 'Write',
            tool_input: { content }
          }
        ]
      })

      expect(result.lines_changed).to.equal(3)
    })

    it('should handle mixed event types in timeline', () => {
      // Only tool_result events are counted, not assistant tool_use blocks
      const result = extract_edit_metrics_from_timeline({
        timeline: [
          { type: 'user', content: 'edit the file' },
          {
            type: 'assistant',
            content: [
              {
                type: 'tool_use',
                name: 'Edit',
                input: { old_string: 'a', new_string: 'b' }
              }
            ]
          },
          {
            type: 'tool_result',
            tool_name: 'Edit',
            tool_input: { old_string: 'a', new_string: 'b' }
          },
          { type: 'system', content: 'system message' }
        ]
      })

      expect(result.edit_count).to.equal(1)
    })
  })
})
