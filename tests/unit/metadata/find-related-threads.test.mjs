/* global describe, it */

import { expect } from 'chai'

import {
  generate_relation_prompt,
  parse_relation_response
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
  })
})
