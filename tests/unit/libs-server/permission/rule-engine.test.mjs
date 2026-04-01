import { expect } from 'chai'

import { evaluate_tag_rules } from '#libs-server/permission/rule-engine.mjs'

describe('rule-engine tag rules', function () {
  describe('evaluate_tag_rules', () => {
    it('should return null when no tag_rules provided', () => {
      const result = evaluate_tag_rules({
        tag_rules: null,
        resource_path: 'user:thread/abc',
        resource_tags: ['user:tag/foo.md']
      })
      expect(result).to.be.null
    })

    it('should return null when tag_rules is empty array', () => {
      const result = evaluate_tag_rules({
        tag_rules: [],
        resource_path: 'user:thread/abc',
        resource_tags: ['user:tag/foo.md']
      })
      expect(result).to.be.null
    })

    it('should return null when resource has no tags', () => {
      const result = evaluate_tag_rules({
        tag_rules: [
          { action: 'allow', tag: 'user:tag/foo.md' }
        ],
        resource_path: 'user:thread/abc',
        resource_tags: []
      })
      expect(result).to.be.null
    })

    it('should return null when no tags match', () => {
      const result = evaluate_tag_rules({
        tag_rules: [
          { action: 'allow', tag: 'user:tag/foo.md' }
        ],
        resource_path: 'user:thread/abc',
        resource_tags: ['user:tag/bar.md']
      })
      expect(result).to.be.null
    })

    it('should match tag and return allow', () => {
      const result = evaluate_tag_rules({
        tag_rules: [
          { action: 'allow', tag: 'user:tag/league.md' }
        ],
        resource_path: 'user:thread/abc',
        resource_tags: ['user:tag/league.md']
      })
      expect(result).to.not.be.null
      expect(result.allowed).to.be.true
      expect(result.reason).to.include('user:tag/league.md')
      expect(result.matching_rule.tag).to.equal('user:tag/league.md')
    })

    it('should match tag and return deny', () => {
      const result = evaluate_tag_rules({
        tag_rules: [
          { action: 'deny', tag: 'user:tag/sensitive.md' }
        ],
        resource_path: 'user:thread/abc',
        resource_tags: ['user:tag/sensitive.md']
      })
      expect(result).to.not.be.null
      expect(result.allowed).to.be.false
    })

    it('should use first matching rule (first match wins)', () => {
      const result = evaluate_tag_rules({
        tag_rules: [
          { action: 'deny', tag: 'user:tag/league.md' },
          { action: 'allow', tag: 'user:tag/league.md' }
        ],
        resource_path: 'user:thread/abc',
        resource_tags: ['user:tag/league.md']
      })
      expect(result).to.not.be.null
      expect(result.allowed).to.be.false
    })

    it('should scope tag rule with pattern field', () => {
      const tag_rules = [
        {
          action: 'allow',
          tag: 'user:tag/league.md',
          pattern: 'user:thread/**'
        }
      ]

      // Should match thread path
      const thread_result = evaluate_tag_rules({
        tag_rules,
        resource_path: 'user:thread/abc-123',
        resource_tags: ['user:tag/league.md']
      })
      expect(thread_result).to.not.be.null
      expect(thread_result.allowed).to.be.true

      // Should not match task path
      const task_result = evaluate_tag_rules({
        tag_rules,
        resource_path: 'user:task/some-task.md',
        resource_tags: ['user:tag/league.md']
      })
      expect(task_result).to.be.null
    })

    it('should match all resource types when pattern is omitted', () => {
      const tag_rules = [
        { action: 'allow', tag: 'user:tag/league.md' }
      ]

      const thread_result = evaluate_tag_rules({
        tag_rules,
        resource_path: 'user:thread/abc',
        resource_tags: ['user:tag/league.md']
      })
      expect(thread_result).to.not.be.null

      const task_result = evaluate_tag_rules({
        tag_rules,
        resource_path: 'user:task/foo.md',
        resource_tags: ['user:tag/league.md']
      })
      expect(task_result).to.not.be.null
    })

    it('should use exact tag string matching (no partial matches)', () => {
      const result = evaluate_tag_rules({
        tag_rules: [
          { action: 'allow', tag: 'user:tag/league.md' }
        ],
        resource_path: 'user:thread/abc',
        resource_tags: ['user:tag/league-xo-football.md']
      })
      expect(result).to.be.null
    })

    it('should skip invalid tag rules', () => {
      const result = evaluate_tag_rules({
        tag_rules: [
          { action: 'allow' },
          { tag: 'user:tag/foo.md' },
          { action: 'allow', tag: 'user:tag/bar.md' }
        ],
        resource_path: 'user:thread/abc',
        resource_tags: ['user:tag/bar.md']
      })
      expect(result).to.not.be.null
      expect(result.allowed).to.be.true
      expect(result.matching_rule.tag).to.equal('user:tag/bar.md')
    })
  })
})
