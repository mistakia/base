/* global describe, it */

import { expect } from 'chai'

import {
  extract_edit_metrics_from_timeline,
  extract_thread_reference_targets
} from '#libs-server/embedded-database-index/sync/thread-data-extractor.mjs'

describe('thread-data-extractor', () => {
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

  describe('extract_thread_reference_targets', () => {
    it('returns empty arrays for missing metadata', () => {
      const result = extract_thread_reference_targets({ metadata: null })
      expect(result.relations).to.deep.equal([])
      expect(result.file_references).to.deep.equal([])
    })

    it('parses relation entries and collects file_references', () => {
      const result = extract_thread_reference_targets({
        metadata: {
          relations: ['modifies [[user:task/a.md]]'],
          user_relations: ['relates_to [[user:text/b.md]]'],
          file_references: ['user:task/c.md', { base_uri: 'user:text/d.md' }]
        }
      })
      expect(result.relations).to.deep.equal([
        'user:task/a.md',
        'user:text/b.md'
      ])
      expect(result.file_references).to.deep.equal([
        'user:task/c.md',
        'user:text/d.md'
      ])
    })

    it('filters out invalid base_uris in file_references', () => {
      const result = extract_thread_reference_targets({
        metadata: {
          file_references: ['not-a-uri', '', null, 'user:task/ok.md']
        }
      })
      expect(result.file_references).to.deep.equal(['user:task/ok.md'])
    })
  })
})
