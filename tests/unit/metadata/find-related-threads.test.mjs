/* global describe, it */

import { expect } from 'chai'

import {
  generate_relation_prompt,
  parse_relation_response,
  parse_json_response,
  extract_repository_name,
  calculate_time_proximity,
  prefilter_candidates,
  resolve_model
} from '#libs-server/metadata/find-related-threads.mjs'

describe('find-related-threads', () => {
  describe('generate_relation_prompt', () => {
    it('should generate prompt with target and candidates', () => {
      const target_thread = {
        title: 'Fix authentication bug',
        short_description: 'Session tokens expire too quickly'
      }

      const candidate_threads = [
        {
          thread_id: 'thread-1',
          title: 'Add OAuth support',
          short_description: 'Implement OAuth2 login'
        },
        {
          thread_id: 'thread-2',
          title: 'Update database schema',
          short_description: 'Add new user fields'
        }
      ]

      const prompt = generate_relation_prompt({
        target_thread,
        candidate_threads
      })

      expect(prompt).to.include('Fix authentication bug')
      expect(prompt).to.include('Session tokens expire too quickly')
      expect(prompt).to.include('1. "Add OAuth support"')
      expect(prompt).to.include('2. "Update database schema"')
      expect(prompt).to.include('DO NOT execute any commands')
    })

    it('should handle missing title/description', () => {
      const target_thread = {}
      const candidate_threads = [{ thread_id: 'thread-1' }]

      const prompt = generate_relation_prompt({
        target_thread,
        candidate_threads
      })

      expect(prompt).to.include('Untitled')
      expect(prompt).to.include('No description')
    })

    it('should number candidates correctly', () => {
      const target_thread = { title: 'Target' }
      const candidate_threads = [
        { thread_id: '1', title: 'First' },
        { thread_id: '2', title: 'Second' },
        { thread_id: '3', title: 'Third' }
      ]

      const prompt = generate_relation_prompt({
        target_thread,
        candidate_threads
      })

      expect(prompt).to.include('1. "First"')
      expect(prompt).to.include('2. "Second"')
      expect(prompt).to.include('3. "Third"')
    })
  })

  describe('parse_relation_response', () => {
    it('should parse comma-separated numbers', () => {
      const result = parse_relation_response({
        response: '1, 3, 5',
        max_candidate: 10
      })

      expect(result).to.deep.equal([0, 2, 4]) // 0-based indices
    })

    it('should handle single number', () => {
      const result = parse_relation_response({
        response: '2',
        max_candidate: 5
      })

      expect(result).to.deep.equal([1])
    })

    it('should return empty array for "none"', () => {
      const result = parse_relation_response({
        response: 'none',
        max_candidate: 5
      })

      expect(result).to.deep.equal([])
    })

    it('should return empty array for empty response', () => {
      const result = parse_relation_response({
        response: '',
        max_candidate: 5
      })

      expect(result).to.deep.equal([])
    })

    it('should filter out invalid numbers', () => {
      const result = parse_relation_response({
        response: '1, 2, 100',
        max_candidate: 5
      })

      expect(result).to.deep.equal([0, 1]) // 100 is out of range
    })

    it('should handle response with extra text', () => {
      const result = parse_relation_response({
        response: 'Related candidates: 1, 3',
        max_candidate: 5
      })

      expect(result).to.deep.equal([0, 2])
    })

    it('should deduplicate numbers', () => {
      const result = parse_relation_response({
        response: '1, 1, 2, 2',
        max_candidate: 5
      })

      expect(result).to.deep.equal([0, 1])
    })

    it('should handle null response', () => {
      const result = parse_relation_response({
        response: null,
        max_candidate: 5
      })

      expect(result).to.deep.equal([])
    })

    it('should handle "0" response as none', () => {
      const result = parse_relation_response({
        response: '0',
        max_candidate: 5
      })

      expect(result).to.deep.equal([])
    })

    it('should parse JSON response format', () => {
      const result = parse_relation_response({
        response:
          '{"related": [{"id": 1, "confidence": "high"}, {"id": 3, "confidence": "medium"}], "reasoning": "test"}',
        max_candidate: 5
      })

      expect(result).to.deep.equal([0, 2])
    })
  })

  describe('parse_json_response', () => {
    it('should parse valid JSON with confidence scores', () => {
      const result = parse_json_response({
        response:
          '{"related": [{"id": 1, "confidence": "high"}, {"id": 2, "confidence": "low"}], "reasoning": "Both work on auth"}',
        max_candidate: 5
      })

      expect(result.indices).to.deep.equal([0, 1])
      expect(result.confidence_map.get(0)).to.equal('high')
      expect(result.confidence_map.get(1)).to.equal('low')
      expect(result.reasoning).to.equal('Both work on auth')
    })

    it('should handle JSON wrapped in markdown code blocks', () => {
      const result = parse_json_response({
        response:
          '```json\n{"related": [{"id": 1, "confidence": "high"}], "reasoning": "test"}\n```',
        max_candidate: 5
      })

      expect(result.indices).to.deep.equal([0])
    })

    it('should handle empty related array', () => {
      const result = parse_json_response({
        response: '{"related": [], "reasoning": "No related threads found"}',
        max_candidate: 5
      })

      expect(result.indices).to.deep.equal([])
      expect(result.reasoning).to.equal('No related threads found')
    })

    it('should filter out invalid candidate numbers', () => {
      const result = parse_json_response({
        response: '{"related": [{"id": 1}, {"id": 100}], "reasoning": "test"}',
        max_candidate: 5
      })

      expect(result.indices).to.deep.equal([0])
    })

    it('should handle malformed JSON gracefully', () => {
      const result = parse_json_response({
        response: 'not valid json',
        max_candidate: 5
      })

      expect(result.indices).to.deep.equal([])
    })
  })

  describe('extract_repository_name', () => {
    it('should extract repo name from path', () => {
      expect(extract_repository_name('/Users/user/Projects/base')).to.equal(
        'base'
      )
      expect(extract_repository_name('/home/dev/league')).to.equal('league')
    })

    it('should handle null/undefined', () => {
      expect(extract_repository_name(null)).to.be.null
      expect(extract_repository_name(undefined)).to.be.null
    })

    it('should handle trailing slash', () => {
      // Trailing slash results in empty string which becomes falsy -> null
      expect(extract_repository_name('/Users/user/Projects/base/')).to.be.null
    })
  })

  describe('calculate_time_proximity', () => {
    it('should return 1 for same date', () => {
      const date = '2025-01-01T00:00:00.000Z'
      expect(calculate_time_proximity(date, date)).to.equal(1)
    })

    it('should return 0 for dates > 30 days apart', () => {
      const date1 = '2025-01-01T00:00:00.000Z'
      const date2 = '2025-03-01T00:00:00.000Z'
      expect(calculate_time_proximity(date1, date2)).to.equal(0)
    })

    it('should return ~0.5 for dates 15 days apart', () => {
      const date1 = '2025-01-01T00:00:00.000Z'
      const date2 = '2025-01-16T00:00:00.000Z'
      const result = calculate_time_proximity(date1, date2)
      expect(result).to.be.closeTo(0.5, 0.05)
    })

    it('should handle null dates', () => {
      expect(calculate_time_proximity(null, '2025-01-01')).to.equal(0)
      expect(calculate_time_proximity('2025-01-01', null)).to.equal(0)
    })
  })

  describe('prefilter_candidates', () => {
    it('should prioritize same repository', () => {
      const target = {
        title: 'Test task',
        updated_at: '2025-01-15T00:00:00.000Z',
        external_session: {
          provider_metadata: { working_directory: '/Users/user/Projects/base' }
        }
      }

      const candidates = [
        {
          thread_id: '1',
          title: 'Different repo task',
          updated_at: '2025-01-15T00:00:00.000Z',
          external_session: {
            provider_metadata: {
              working_directory: '/Users/user/Projects/league'
            }
          }
        },
        {
          thread_id: '2',
          title: 'Same repo task',
          updated_at: '2025-01-15T00:00:00.000Z',
          external_session: {
            provider_metadata: {
              working_directory: '/Users/user/Projects/base'
            }
          }
        }
      ]

      const result = prefilter_candidates({
        target_thread: target,
        candidate_threads: candidates,
        max_candidates: 10
      })

      // Same repo should be first due to higher score
      expect(result[0].thread_id).to.equal('2')
    })

    it('should limit to max_candidates', () => {
      const target = { title: 'Test', updated_at: '2025-01-15T00:00:00.000Z' }
      const candidates = Array.from({ length: 50 }, (_, i) => ({
        thread_id: String(i),
        title: `Thread ${i}`,
        updated_at: '2025-01-15T00:00:00.000Z'
      }))

      const result = prefilter_candidates({
        target_thread: target,
        candidate_threads: candidates,
        max_candidates: 10
      })

      expect(result).to.have.lengthOf(10)
    })

    it('should consider keyword overlap', () => {
      const target = {
        title: 'Fix authentication bug',
        updated_at: '2025-01-15T00:00:00.000Z'
      }

      const candidates = [
        {
          thread_id: '1',
          title: 'Update database schema',
          updated_at: '2025-01-15T00:00:00.000Z'
        },
        {
          thread_id: '2',
          title: 'Authentication improvements',
          updated_at: '2025-01-15T00:00:00.000Z'
        }
      ]

      const result = prefilter_candidates({
        target_thread: target,
        candidate_threads: candidates,
        max_candidates: 10
      })

      // Authentication keyword overlap should boost second candidate
      expect(result[0].thread_id).to.equal('2')
    })
  })

  describe('resolve_model', () => {
    it('should pass through unknown model identifiers', () => {
      expect(resolve_model('ollama/custom-model:latest')).to.equal(
        'ollama/custom-model:latest'
      )
    })

    it('should resolve model aliases to full identifiers', () => {
      expect(resolve_model('qwen2.5')).to.equal('ollama/qwen2.5:72b')
      expect(resolve_model('qwen')).to.equal('ollama/qwen2.5:72b')
    })

    it('should return default for null/undefined', () => {
      expect(resolve_model(null)).to.equal('ollama/qwen2.5:72b')
      expect(resolve_model(undefined)).to.equal('ollama/qwen2.5:72b')
    })
  })

  describe('generate_relation_prompt with repository info', () => {
    it('should include repository information in prompt', () => {
      const target_thread = {
        title: 'Fix bug',
        short_description: 'Bug fix',
        external_session: {
          provider_metadata: { working_directory: '/Users/user/Projects/base' }
        }
      }

      const candidate_threads = [
        {
          thread_id: 'thread-1',
          title: 'Another task',
          short_description: 'Task desc',
          external_session: {
            provider_metadata: {
              working_directory: '/Users/user/Projects/league'
            }
          }
        }
      ]

      const prompt = generate_relation_prompt({
        target_thread,
        candidate_threads
      })

      expect(prompt).to.include('[Repository: base]')
      expect(prompt).to.include('[league]')
    })

    it('should generate JSON output format when requested', () => {
      const target_thread = { title: 'Test', short_description: 'desc' }
      const candidate_threads = [
        { thread_id: '1', title: 'Other', short_description: 'other desc' }
      ]

      const prompt = generate_relation_prompt({
        target_thread,
        candidate_threads,
        use_json_output: true
      })

      expect(prompt).to.include('Respond with JSON only')
      expect(prompt).to.include('"confidence"')
      expect(prompt).to.include('DEFINITION OF RELATED')
    })
  })
})
