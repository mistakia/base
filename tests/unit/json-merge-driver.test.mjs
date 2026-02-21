/* global describe, it */

import { expect } from 'chai'

import { merge_json } from '../../cli/json-merge-driver.mjs'

describe('json-merge-driver', () => {
  describe('disjoint field changes', () => {
    it('should accept ours-only change', () => {
      const base = { title: 'original', thread_state: 'active' }
      const ours = { title: 'updated', thread_state: 'active' }
      const theirs = { title: 'original', thread_state: 'active' }

      const result = merge_json({ base, ours, theirs })

      expect(result.title).to.equal('updated')
      expect(result.thread_state).to.equal('active')
    })

    it('should accept theirs-only change', () => {
      const base = { title: 'original', thread_state: 'active' }
      const ours = { title: 'original', thread_state: 'active' }
      const theirs = { title: 'original', thread_state: 'archived' }

      const result = merge_json({ base, ours, theirs })

      expect(result.title).to.equal('original')
      expect(result.thread_state).to.equal('archived')
    })

    it('should accept disjoint changes from both sides', () => {
      const base = { title: 'original', thread_state: 'active' }
      const ours = { title: 'updated', thread_state: 'active' }
      const theirs = { title: 'original', thread_state: 'archived' }

      const result = merge_json({ base, ours, theirs })

      expect(result.title).to.equal('updated')
      expect(result.thread_state).to.equal('archived')
    })

    it('should handle new fields added by ours', () => {
      const base = { title: 'original' }
      const ours = { title: 'original', short_description: 'new desc' }
      const theirs = { title: 'original' }

      const result = merge_json({ base, ours, theirs })

      expect(result.short_description).to.equal('new desc')
    })

    it('should handle new fields added by theirs', () => {
      const base = { title: 'original' }
      const ours = { title: 'original' }
      const theirs = { title: 'original', archived_at: '2026-01-01T00:00:00Z' }

      const result = merge_json({ base, ours, theirs })

      expect(result.archived_at).to.equal('2026-01-01T00:00:00Z')
    })

    it('should handle field deleted by theirs', () => {
      const base = { title: 'original', short_description: 'desc' }
      const ours = { title: 'original', short_description: 'desc' }
      const theirs = { title: 'original' }

      const result = merge_json({ base, ours, theirs })

      expect(result).to.not.have.property('short_description')
    })
  })

  describe('same value both sides', () => {
    it('should accept when both sides made the same change', () => {
      const base = { title: 'original' }
      const ours = { title: 'same update' }
      const theirs = { title: 'same update' }

      const result = merge_json({ base, ours, theirs })

      expect(result.title).to.equal('same update')
    })
  })

  describe('timestamp conflict resolution', () => {
    it('should take the later timestamp when both sides change updated_at', () => {
      const base = { updated_at: '2026-01-01T00:00:00Z' }
      const ours = { updated_at: '2026-01-01T12:00:00Z' }
      const theirs = { updated_at: '2026-01-01T18:00:00Z' }

      const result = merge_json({ base, ours, theirs })

      expect(result.updated_at).to.equal('2026-01-01T18:00:00Z')
    })

    it('should take ours timestamp when ours is later', () => {
      const base = { tags_analyzed_at: '2026-01-01T00:00:00Z' }
      const ours = { tags_analyzed_at: '2026-01-02T00:00:00Z' }
      const theirs = { tags_analyzed_at: '2026-01-01T06:00:00Z' }

      const result = merge_json({ base, ours, theirs })

      expect(result.tags_analyzed_at).to.equal('2026-01-02T00:00:00Z')
    })

    it('should handle null on one side for timestamp fields', () => {
      const base = { archived_at: null }
      const ours = { archived_at: '2026-01-01T00:00:00Z' }
      const theirs = { archived_at: '2026-01-02T00:00:00Z' }

      const result = merge_json({ base, ours, theirs })

      expect(result.archived_at).to.equal('2026-01-02T00:00:00Z')
    })
  })

  describe('array union merge', () => {
    it('should union tags from both sides', () => {
      const base = { tags: ['tag-a'] }
      const ours = { tags: ['tag-a', 'tag-b'] }
      const theirs = { tags: ['tag-a', 'tag-c'] }

      const result = merge_json({ base, ours, theirs })

      expect(result.tags).to.include('tag-a')
      expect(result.tags).to.include('tag-b')
      expect(result.tags).to.include('tag-c')
      expect(result.tags).to.have.lengthOf(3)
    })

    it('should handle removal by one side', () => {
      const base = { tags: ['tag-a', 'tag-b', 'tag-c'] }
      const ours = { tags: ['tag-a', 'tag-b'] }
      const theirs = { tags: ['tag-a', 'tag-b', 'tag-c', 'tag-d'] }

      const result = merge_json({ base, ours, theirs })

      expect(result.tags).to.include('tag-a')
      expect(result.tags).to.include('tag-b')
      expect(result.tags).to.include('tag-d')
      expect(result.tags).to.not.include('tag-c')
    })

    it('should union relations from both sides', () => {
      const base = { relations: ['modifies [[a]]'] }
      const ours = { relations: ['modifies [[a]]', 'creates [[b]]'] }
      const theirs = { relations: ['modifies [[a]]', 'relates_to [[c]]'] }

      const result = merge_json({ base, ours, theirs })

      expect(result.relations).to.have.lengthOf(3)
      expect(result.relations).to.include('creates [[b]]')
      expect(result.relations).to.include('relates_to [[c]]')
    })

    it('should deduplicate array entries', () => {
      const base = { tools_used: [] }
      const ours = { tools_used: ['Read', 'Edit'] }
      const theirs = { tools_used: ['Read', 'Write'] }

      const result = merge_json({ base, ours, theirs })

      expect(result.tools_used).to.include('Read')
      expect(result.tools_used).to.include('Edit')
      expect(result.tools_used).to.include('Write')
      const read_count = result.tools_used.filter((t) => t === 'Read').length
      expect(read_count).to.equal(1)
    })

    it('should handle base with no array and both sides adding', () => {
      const base = {}
      const ours = { tags: ['tag-a'] }
      const theirs = { tags: ['tag-b'] }

      const result = merge_json({ base, ours, theirs })

      expect(result.tags).to.include('tag-a')
      expect(result.tags).to.include('tag-b')
    })
  })

  describe('nested object merge', () => {
    it('should merge disjoint sub-keys in source object', () => {
      const base = { source: { provider: 'claude' } }
      const ours = { source: { provider: 'claude', session_id: 'abc' } }
      const theirs = {
        source: { provider: 'claude', imported_at: '2026-01-01T00:00:00Z' }
      }

      const result = merge_json({ base, ours, theirs })

      expect(result.source.provider).to.equal('claude')
      expect(result.source.session_id).to.equal('abc')
      expect(result.source.imported_at).to.equal('2026-01-01T00:00:00Z')
    })

    it('should handle sub-key deletion by theirs', () => {
      const base = { source: { provider: 'claude', raw_data_saved: true } }
      const ours = { source: { provider: 'claude', raw_data_saved: true } }
      const theirs = { source: { provider: 'claude' } }

      const result = merge_json({ base, ours, theirs })

      expect(result.source).to.not.have.property('raw_data_saved')
    })

    it('should return null for conflicting sub-key values', () => {
      const base = { source: { provider: 'claude' } }
      const ours = { source: { provider: 'openai' } }
      const theirs = { source: { provider: 'gemini' } }

      const result = merge_json({ base, ours, theirs })

      expect(result).to.be.null
    })

    it('should merge prompt_properties with disjoint changes', () => {
      const base = { prompt_properties: {} }
      const ours = { prompt_properties: { auto_mode: true } }
      const theirs = { prompt_properties: { verbose: false } }

      const result = merge_json({ base, ours, theirs })

      expect(result.prompt_properties.auto_mode).to.equal(true)
      expect(result.prompt_properties.verbose).to.equal(false)
    })
  })

  describe('numeric max resolution', () => {
    it('should take the higher message_count', () => {
      const base = { message_count: 10 }
      const ours = { message_count: 15 }
      const theirs = { message_count: 20 }

      const result = merge_json({ base, ours, theirs })

      expect(result.message_count).to.equal(20)
    })

    it('should take the higher token counts', () => {
      const base = { input_tokens: 100, output_tokens: 200 }
      const ours = { input_tokens: 150, output_tokens: 250 }
      const theirs = { input_tokens: 120, output_tokens: 300 }

      const result = merge_json({ base, ours, theirs })

      expect(result.input_tokens).to.equal(150)
      expect(result.output_tokens).to.equal(300)
    })
  })

  describe('unknown scalar conflict', () => {
    it('should return null for conflicting unknown scalar fields', () => {
      const base = { title: 'original' }
      const ours = { title: 'ours title' }
      const theirs = { title: 'theirs title' }

      const result = merge_json({ base, ours, theirs })

      expect(result).to.be.null
    })
  })

  describe('no changes', () => {
    it('should return the same object when nothing changed', () => {
      const base = { title: 'same', thread_state: 'active' }
      const ours = { title: 'same', thread_state: 'active' }
      const theirs = { title: 'same', thread_state: 'active' }

      const result = merge_json({ base, ours, theirs })

      expect(result).to.deep.equal(base)
    })
  })

  describe('realistic merge scenario', () => {
    it('should merge typical session lifecycle vs LLM analysis updates', () => {
      const base = {
        thread_id: 'abc-123',
        thread_state: 'active',
        updated_at: '2026-01-01T00:00:00Z',
        message_count: 10,
        tool_call_count: 50,
        tags: ['user:tag/base-project.md'],
        relations: [],
        source: { provider: 'claude', session_id: 'sess-1' }
      }

      // Machine A: session lifecycle (state change, counters)
      const ours = {
        thread_id: 'abc-123',
        thread_state: 'archived',
        updated_at: '2026-01-01T12:00:00Z',
        archived_at: '2026-01-01T12:00:00Z',
        message_count: 25,
        tool_call_count: 120,
        tags: ['user:tag/base-project.md'],
        relations: [],
        source: { provider: 'claude', session_id: 'sess-1' }
      }

      // Machine B: LLM metadata analysis (title, tags, relations)
      const theirs = {
        thread_id: 'abc-123',
        thread_state: 'active',
        updated_at: '2026-01-01T06:00:00Z',
        title: 'Implement JSON merge driver',
        short_description: 'Custom git merge driver for metadata.json',
        message_count: 10,
        tool_call_count: 50,
        tags: ['user:tag/base-project.md', 'user:tag/git-workflow.md'],
        tags_analyzed_at: '2026-01-01T06:00:00Z',
        relations: [
          'relates [[user:task/base/implement-json-merge-driver.md]]'
        ],
        relations_analyzed_at: '2026-01-01T06:00:00Z',
        source: { provider: 'claude', session_id: 'sess-1' }
      }

      const result = merge_json({ base, ours, theirs })

      // session lifecycle wins for state
      expect(result.thread_state).to.equal('archived')
      expect(result.archived_at).to.equal('2026-01-01T12:00:00Z')

      // later timestamp wins
      expect(result.updated_at).to.equal('2026-01-01T12:00:00Z')

      // higher counters win
      expect(result.message_count).to.equal(25)
      expect(result.tool_call_count).to.equal(120)

      // LLM analysis fields accepted (disjoint)
      expect(result.title).to.equal('Implement JSON merge driver')
      expect(result.short_description).to.equal(
        'Custom git merge driver for metadata.json'
      )

      // tags unioned
      expect(result.tags).to.include('user:tag/base-project.md')
      expect(result.tags).to.include('user:tag/git-workflow.md')

      // relations unioned
      expect(result.relations).to.include(
        'relates [[user:task/base/implement-json-merge-driver.md]]'
      )

      // analysis timestamps accepted (disjoint)
      expect(result.tags_analyzed_at).to.equal('2026-01-01T06:00:00Z')
      expect(result.relations_analyzed_at).to.equal('2026-01-01T06:00:00Z')

      // source unchanged
      expect(result.source.provider).to.equal('claude')
    })
  })
})
