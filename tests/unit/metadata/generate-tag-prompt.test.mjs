/* global describe, it */

import { expect } from 'chai'

import {
  format_tags_for_prompt,
  generate_tag_analysis_prompt,
  parse_tag_analysis_response,
  TAG_CONSTRAINTS
} from '#libs-server/metadata/generate-tag-prompt.mjs'

describe('generate-tag-prompt', () => {
  describe('TAG_CONSTRAINTS', () => {
    it('should have MAX_TAGS defined', () => {
      expect(TAG_CONSTRAINTS.MAX_TAGS).to.be.a('number')
      expect(TAG_CONSTRAINTS.MAX_TAGS).to.be.greaterThan(0)
    })

    it('should have MIN_CONFIDENCE defined', () => {
      expect(TAG_CONSTRAINTS.MIN_CONFIDENCE).to.be.a('number')
      expect(TAG_CONSTRAINTS.MIN_CONFIDENCE).to.be.within(0, 1)
    })
  })

  describe('format_tags_for_prompt', () => {
    it('should format a single tag', () => {
      const tags = [
        {
          base_uri: 'user:tag/test-tag.md',
          title: 'Test Tag',
          description: 'A test tag for testing',
          content: ''
        }
      ]

      const result = format_tags_for_prompt(tags)

      expect(result).to.include('### Test Tag')
      expect(result).to.include('base_uri: user:tag/test-tag.md')
      expect(result).to.include('A test tag for testing')
    })

    it('should format multiple tags', () => {
      const tags = [
        {
          base_uri: 'user:tag/tag-a.md',
          title: 'Tag A',
          description: 'Description A',
          content: ''
        },
        {
          base_uri: 'user:tag/tag-b.md',
          title: 'Tag B',
          description: 'Description B',
          content: ''
        }
      ]

      const result = format_tags_for_prompt(tags)

      expect(result).to.include('### Tag A')
      expect(result).to.include('### Tag B')
    })

    it('should include content preview when available', () => {
      const tags = [
        {
          base_uri: 'user:tag/test-tag.md',
          title: 'Test Tag',
          description: 'A test tag',
          content: 'This is the full content of the tag file.'
        }
      ]

      const result = format_tags_for_prompt(tags)

      expect(result).to.include('This is the full content of the tag file.')
    })

    it('should truncate long content', () => {
      const long_content = 'A'.repeat(600)
      const tags = [
        {
          base_uri: 'user:tag/test-tag.md',
          title: 'Test Tag',
          description: 'A test tag',
          content: long_content
        }
      ]

      const result = format_tags_for_prompt(tags)

      expect(result).to.include('...')
      expect(result.length).to.be.lessThan(long_content.length + 200)
    })

    it('should handle empty tags array', () => {
      const result = format_tags_for_prompt([])
      expect(result).to.equal('')
    })
  })

  describe('generate_tag_analysis_prompt', () => {
    const sample_tags = [
      {
        base_uri: 'user:tag/software-task.md',
        title: 'Software Task',
        description: 'For software development tasks',
        content: ''
      }
    ]

    it('should include user message', () => {
      const result = generate_tag_analysis_prompt({
        user_message: 'Fix the authentication bug',
        tags: sample_tags
      })

      expect(result).to.include('Fix the authentication bug')
    })

    it('should include thread title when provided', () => {
      const result = generate_tag_analysis_prompt({
        user_message: 'Fix the bug',
        title: 'Auth Bug Fix',
        tags: sample_tags
      })

      expect(result).to.include('Title: Auth Bug Fix')
    })

    it('should include thread description when provided', () => {
      const result = generate_tag_analysis_prompt({
        user_message: 'Fix the bug',
        short_description: 'Fixing login issue',
        tags: sample_tags
      })

      expect(result).to.include('Description: Fixing login issue')
    })

    it('should include formatted tags', () => {
      const result = generate_tag_analysis_prompt({
        user_message: 'Test message',
        tags: sample_tags
      })

      expect(result).to.include('### Software Task')
      expect(result).to.include('user:tag/software-task.md')
    })

    it('should include JSON response format instructions', () => {
      const result = generate_tag_analysis_prompt({
        user_message: 'Test message',
        tags: sample_tags
      })

      expect(result).to.include('"tags"')
      expect(result).to.include('"reasoning"')
      expect(result).to.include('```json')
    })

    it('should reference MAX_TAGS constraint', () => {
      const result = generate_tag_analysis_prompt({
        user_message: 'Test message',
        tags: sample_tags
      })

      expect(result).to.include(`0-${TAG_CONSTRAINTS.MAX_TAGS}`)
    })
  })

  describe('parse_tag_analysis_response', () => {
    const available_tags = [
      { base_uri: 'user:tag/software-task.md' },
      { base_uri: 'user:tag/base-project.md' },
      { base_uri: 'user:tag/league-xo-football.md' }
    ]

    it('should parse valid JSON response', () => {
      const response = `\`\`\`json
{
  "tags": ["user:tag/software-task.md"],
  "reasoning": "This is a software task"
}
\`\`\``

      const result = parse_tag_analysis_response(response, available_tags)

      expect(result.success).to.be.true
      expect(result.tags).to.deep.equal(['user:tag/software-task.md'])
      expect(result.reasoning).to.equal('This is a software task')
    })

    it('should parse JSON without code block', () => {
      const response = `{
  "tags": ["user:tag/base-project.md"],
  "reasoning": "Working on base system"
}`

      const result = parse_tag_analysis_response(response, available_tags)

      expect(result.success).to.be.true
      expect(result.tags).to.deep.equal(['user:tag/base-project.md'])
    })

    it('should parse multiple tags', () => {
      const response = `{
  "tags": ["user:tag/software-task.md", "user:tag/base-project.md"],
  "reasoning": "Software work on base"
}`

      const result = parse_tag_analysis_response(response, available_tags)

      expect(result.success).to.be.true
      expect(result.tags).to.have.length(2)
    })

    it('should filter out invalid tags', () => {
      const response = `{
  "tags": ["user:tag/software-task.md", "user:tag/nonexistent-tag.md"],
  "reasoning": "Test"
}`

      const result = parse_tag_analysis_response(response, available_tags)

      expect(result.success).to.be.true
      expect(result.tags).to.deep.equal(['user:tag/software-task.md'])
    })

    it('should limit tags to MAX_TAGS', () => {
      const many_tags = available_tags.map((t) => t.base_uri)
      const response = `{
  "tags": ${JSON.stringify(many_tags)},
  "reasoning": "All tags"
}`

      const result = parse_tag_analysis_response(response, available_tags)

      expect(result.success).to.be.true
      expect(result.tags.length).to.be.at.most(TAG_CONSTRAINTS.MAX_TAGS)
    })

    it('should handle empty tags array', () => {
      const response = `{
  "tags": [],
  "reasoning": "No matching tags"
}`

      const result = parse_tag_analysis_response(response, available_tags)

      expect(result.success).to.be.true
      expect(result.tags).to.deep.equal([])
    })

    it('should fail for empty response', () => {
      const result = parse_tag_analysis_response('', available_tags)

      expect(result.success).to.be.false
      expect(result.error).to.include('Empty response')
    })

    it('should fail for non-JSON response', () => {
      const response = 'This is not JSON at all'

      const result = parse_tag_analysis_response(response, available_tags)

      expect(result.success).to.be.false
      expect(result.error).to.include('No JSON found')
    })

    it('should fail for null response', () => {
      const result = parse_tag_analysis_response(null, available_tags)

      expect(result.success).to.be.false
    })

    it('should handle missing reasoning field', () => {
      const response = `{
  "tags": ["user:tag/software-task.md"]
}`

      const result = parse_tag_analysis_response(response, available_tags)

      expect(result.success).to.be.true
      expect(result.reasoning).to.be.null
    })

    it('should handle non-string tags in array', () => {
      const response = `{
  "tags": ["user:tag/software-task.md", 123, null],
  "reasoning": "Test"
}`

      const result = parse_tag_analysis_response(response, available_tags)

      expect(result.success).to.be.true
      expect(result.tags).to.deep.equal(['user:tag/software-task.md'])
    })

    it('should handle tags field not being an array', () => {
      const response = `{
  "tags": "user:tag/software-task.md",
  "reasoning": "Test"
}`

      const result = parse_tag_analysis_response(response, available_tags)

      expect(result.success).to.be.true
      expect(result.tags).to.deep.equal([])
    })
  })
})
