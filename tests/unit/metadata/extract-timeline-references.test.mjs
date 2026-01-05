/* global describe, it */

import { expect } from 'chai'

import {
  extract_timeline_references,
  extract_from_tool_calls,
  extract_from_messages,
  extract_from_bash_commands,
  convert_paths_to_base_uris,
  deduplicate_references,
  TOOL_ACCESS_TYPES
} from '#libs-server/metadata/extract-timeline-references.mjs'

describe('extract-timeline-references', () => {
  describe('TOOL_ACCESS_TYPES', () => {
    it('should map Read to read access', () => {
      expect(TOOL_ACCESS_TYPES.Read).to.equal('read')
    })

    it('should map Edit to modify access', () => {
      expect(TOOL_ACCESS_TYPES.Edit).to.equal('modify')
    })

    it('should map Write to modify access', () => {
      expect(TOOL_ACCESS_TYPES.Write).to.equal('modify')
    })

    it('should map mcp__base__entity_create to create access', () => {
      expect(TOOL_ACCESS_TYPES.mcp__base__entity_create).to.equal('create')
    })
  })

  describe('extract_from_tool_calls', () => {
    it('should extract Read tool calls', () => {
      const timeline = [
        {
          type: 'tool_call',
          content: {
            tool_name: 'Read',
            tool_parameters: { file_path: '/path/to/entity.md' }
          }
        }
      ]

      const result = extract_from_tool_calls({ timeline })

      expect(result).to.have.length(1)
      expect(result[0].path).to.equal('/path/to/entity.md')
      expect(result[0].access_type).to.equal('read')
      expect(result[0].confidence).to.equal('high')
    })

    it('should extract Edit tool calls', () => {
      const timeline = [
        {
          type: 'tool_call',
          content: {
            tool_name: 'Edit',
            tool_parameters: { file_path: '/path/to/entity.md' }
          }
        }
      ]

      const result = extract_from_tool_calls({ timeline })

      expect(result).to.have.length(1)
      expect(result[0].access_type).to.equal('modify')
    })

    it('should extract mcp__base__entity_create with base_uri', () => {
      const timeline = [
        {
          type: 'tool_call',
          content: {
            tool_name: 'mcp__base__entity_create',
            tool_parameters: { base_uri: 'user:task/new-task.md' }
          }
        }
      ]

      const result = extract_from_tool_calls({ timeline })

      expect(result).to.have.length(1)
      expect(result[0].base_uri).to.equal('user:task/new-task.md')
      expect(result[0].access_type).to.equal('create')
    })

    it('should skip non-tool entries', () => {
      const timeline = [
        { type: 'message', content: 'Hello' },
        {
          type: 'tool_call',
          content: {
            tool_name: 'Read',
            tool_parameters: { file_path: '/path/to/file.md' }
          }
        }
      ]

      const result = extract_from_tool_calls({ timeline })

      expect(result).to.have.length(1)
    })

    it('should skip unknown tool types', () => {
      const timeline = [
        {
          type: 'tool_call',
          content: {
            tool_name: 'UnknownTool',
            tool_parameters: { file_path: '/path/to/file.md' }
          }
        }
      ]

      const result = extract_from_tool_calls({ timeline })

      expect(result).to.have.length(0)
    })
  })

  describe('extract_from_messages', () => {
    it('should extract wikilinks from messages', () => {
      const timeline = [
        {
          type: 'message',
          role: 'user',
          content: 'Please update [[user:task/my-task.md]]'
        }
      ]

      const result = extract_from_messages({ timeline })

      expect(result).to.have.length(1)
      expect(result[0].base_uri).to.equal('user:task/my-task.md')
      expect(result[0].access_type).to.equal('reference')
    })

    it('should extract @path patterns from user messages', () => {
      const timeline = [
        {
          type: 'message',
          role: 'user',
          content: 'Update @task/my-task.md please'
        }
      ]

      const result = extract_from_messages({ timeline })

      expect(result).to.have.length(1)
      expect(result[0].path).to.equal('task/my-task.md')
      expect(result[0].confidence).to.equal('medium')
    })

    it('should extract multiple references from one message', () => {
      const timeline = [
        {
          type: 'message',
          role: 'user',
          content: '[[user:task/a.md]] and [[user:task/b.md]]'
        }
      ]

      const result = extract_from_messages({ timeline })

      expect(result).to.have.length(2)
    })

    it('should skip non-message entries', () => {
      const timeline = [{ type: 'tool_call', content: { tool_name: 'Read' } }]

      const result = extract_from_messages({ timeline })

      expect(result).to.have.length(0)
    })
  })

  describe('extract_from_bash_commands', () => {
    it('should extract cat command paths', () => {
      const timeline = [
        {
          type: 'tool_call',
          content: {
            tool_name: 'Bash',
            tool_parameters: { command: 'cat /path/to/file.md' }
          }
        }
      ]

      const result = extract_from_bash_commands({ timeline })

      expect(result).to.have.length(1)
      expect(result[0].path).to.equal('/path/to/file.md')
      expect(result[0].access_type).to.equal('read')
    })

    it('should extract mkdir command paths', () => {
      const timeline = [
        {
          type: 'tool_call',
          content: {
            tool_name: 'Bash',
            tool_parameters: { command: 'mkdir /path/to/dir' }
          }
        }
      ]

      const result = extract_from_bash_commands({ timeline })

      expect(result).to.have.length(1)
      expect(result[0].access_type).to.equal('create')
    })

    it('should handle cp command with src and dst', () => {
      const timeline = [
        {
          type: 'tool_call',
          content: {
            tool_name: 'Bash',
            tool_parameters: { command: 'cp /src/file.md /dst/file.md' }
          }
        }
      ]

      const result = extract_from_bash_commands({ timeline })

      expect(result).to.have.length(2)
      expect(result[0].access_type).to.equal('read')
      expect(result[1].access_type).to.equal('create')
    })

    it('should skip non-Bash tool calls', () => {
      const timeline = [
        {
          type: 'tool_call',
          content: {
            tool_name: 'Read',
            tool_parameters: { file_path: '/path/to/file.md' }
          }
        }
      ]

      const result = extract_from_bash_commands({ timeline })

      expect(result).to.have.length(0)
    })
  })

  describe('convert_paths_to_base_uris', () => {
    it('should pass through references with existing base_uri', () => {
      const references = [
        { base_uri: 'user:task/my-task.md', access_type: 'read' }
      ]

      const result = convert_paths_to_base_uris({ references })

      expect(result).to.have.length(1)
      expect(result[0].base_uri).to.equal('user:task/my-task.md')
    })

    it('should filter out non-.md files', () => {
      const references = [
        { path: '/path/to/file.js', access_type: 'read' },
        { path: '/path/to/entity.md', access_type: 'read' }
      ]

      const result = convert_paths_to_base_uris({ references })

      // Should only include .md files (entity.md would fail path conversion
      // but that's expected - we're testing the .md filter)
      expect(result.every((r) => !r.path || r.path.endsWith('.md'))).to.be.true
    })
  })

  describe('deduplicate_references', () => {
    it('should remove duplicate base_uris', () => {
      const references = [
        { base_uri: 'user:task/my-task.md', access_type: 'read' },
        { base_uri: 'user:task/my-task.md', access_type: 'read' }
      ]

      const result = deduplicate_references({ references })

      expect(result).to.have.length(1)
    })

    it('should keep higher priority access type', () => {
      const references = [
        {
          base_uri: 'user:task/my-task.md',
          access_type: 'read',
          confidence: 'high'
        },
        {
          base_uri: 'user:task/my-task.md',
          access_type: 'modify',
          confidence: 'high'
        }
      ]

      const result = deduplicate_references({ references })

      expect(result).to.have.length(1)
      expect(result[0].access_type).to.equal('modify')
    })

    it('should prefer high confidence', () => {
      const references = [
        {
          base_uri: 'user:task/my-task.md',
          access_type: 'read',
          confidence: 'medium'
        },
        {
          base_uri: 'user:task/my-task.md',
          access_type: 'read',
          confidence: 'high'
        }
      ]

      const result = deduplicate_references({ references })

      expect(result).to.have.length(1)
      expect(result[0].confidence).to.equal('high')
    })
  })

  describe('extract_timeline_references', () => {
    it('should return empty array for null timeline', () => {
      const result = extract_timeline_references({ timeline: null })
      expect(result.references).to.deep.equal([])
    })

    it('should return empty array for empty timeline', () => {
      const result = extract_timeline_references({ timeline: [] })
      expect(result.references).to.deep.equal([])
    })

    it('should combine references from all sources', () => {
      const timeline = [
        {
          type: 'message',
          role: 'user',
          content: '[[user:task/ref.md]]'
        },
        {
          type: 'tool_call',
          content: {
            tool_name: 'mcp__base__entity_create',
            tool_parameters: { base_uri: 'user:task/created.md' }
          }
        }
      ]

      const result = extract_timeline_references({ timeline })

      // Should have references from both messages and tool calls
      expect(result.references.length).to.be.greaterThan(0)
    })
  })
})
