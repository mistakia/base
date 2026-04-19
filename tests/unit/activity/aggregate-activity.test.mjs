/* global describe it */
import { expect } from 'chai'

import { calculate_activity_score } from '#libs-server/activity/calculate-activity-score.mjs'

describe('Activity Aggregation', () => {
  describe('calculate_activity_score', () => {
    it('should calculate score with all metrics', () => {
      const metrics = {
        activity_git_commits: 5,
        activity_git_files_changed: 10,
        activity_git_lines_changed: 500,
        activity_token_usage: 5000,
        activity_thread_edits: 3,
        activity_thread_lines_changed: 200
      }

      const score = calculate_activity_score(metrics)

      // Expected: (5 * 10) + (10 * 2) + floor(500/100) + floor(sqrt(5000/1000)) + (3 * 5) + floor(200/50)
      // = 50 + 20 + 5 + 2 + 15 + 4 = 96
      expect(score).to.equal(96)
    })

    it('should handle zero values for all metrics', () => {
      const metrics = {
        activity_git_commits: 0,
        activity_git_files_changed: 0,
        activity_git_lines_changed: 0,
        activity_token_usage: 0,
        activity_thread_edits: 0,
        activity_thread_lines_changed: 0
      }

      const score = calculate_activity_score(metrics)
      expect(score).to.equal(0)
    })

    it('should handle missing metrics (defaults to 0)', () => {
      const score = calculate_activity_score({})
      expect(score).to.equal(0)
    })

    it('should calculate score with only git commits', () => {
      const metrics = {
        activity_git_commits: 3
      }

      const score = calculate_activity_score(metrics)
      // 3 * 10 = 30
      expect(score).to.equal(30)
    })

    it('should calculate score with only git files changed', () => {
      const metrics = {
        activity_git_files_changed: 5
      }

      const score = calculate_activity_score(metrics)
      // 5 * 2 = 10
      expect(score).to.equal(10)
    })

    it('should calculate score with only git lines changed', () => {
      const metrics = {
        activity_git_lines_changed: 250
      }

      const score = calculate_activity_score(metrics)
      // Math.floor(250 / 100) = 2
      expect(score).to.equal(2)
    })

    it('should calculate score with only token usage', () => {
      const metrics = {
        activity_token_usage: 3500
      }

      const score = calculate_activity_score(metrics)
      // Math.floor(Math.sqrt(3500 / 1000)) = floor(sqrt(3.5)) = 1
      expect(score).to.equal(1)
    })

    it('should calculate score with only thread edits', () => {
      const metrics = {
        activity_thread_edits: 4
      }

      const score = calculate_activity_score(metrics)
      // 4 * 5 = 20
      expect(score).to.equal(20)
    })

    it('should calculate score with only thread lines changed', () => {
      const metrics = {
        activity_thread_lines_changed: 150
      }

      const score = calculate_activity_score(metrics)
      // Math.floor(150 / 50) = 3
      expect(score).to.equal(3)
    })

    it('should floor division for lines and tokens', () => {
      const metrics = {
        activity_git_lines_changed: 199, // Should floor to 1 (199/100 = 1.99)
        activity_token_usage: 1999 // Should floor to 1 (1999/1000 = 1.999)
      }

      const score = calculate_activity_score(metrics)
      // Math.floor(199 / 100) + Math.floor(1999 / 1000) = 1 + 1 = 2
      expect(score).to.equal(2)
    })

    it('should handle large values correctly', () => {
      const metrics = {
        activity_git_commits: 100,
        activity_git_files_changed: 50,
        activity_git_lines_changed: 10000,
        activity_token_usage: 50000,
        activity_thread_edits: 20,
        activity_thread_lines_changed: 1000
      }

      const score = calculate_activity_score(metrics)
      // (100 * 10) + (50 * 2) + floor(10000/100) + floor(sqrt(50000/1000)) + (20 * 5) + floor(1000/50)
      // = 1000 + 100 + 100 + 7 + 100 + 20 = 1327
      expect(score).to.equal(1327)
    })

    it('should handle partial metrics', () => {
      const metrics = {
        activity_git_commits: 2,
        activity_token_usage: 2000
      }

      const score = calculate_activity_score(metrics)
      // (2 * 10) + floor(sqrt(2000/1000)) = 20 + 1 = 21
      expect(score).to.equal(21)
    })

    it('should verify weighting formula matches documentation', () => {
      // Test the documented formula from the task:
      // score = (commits * 10) + (files_changed * 2) + (lines_changed / 100) + (tokens / 1000) + (thread_edits * 5)
      const metrics = {
        activity_git_commits: 3,
        activity_git_files_changed: 8,
        activity_git_lines_changed: 250,
        activity_token_usage: 15000,
        activity_thread_edits: 12
      }

      const score = calculate_activity_score(metrics)
      // (3 * 10) + (8 * 2) + Math.floor(250 / 100) + Math.floor(Math.sqrt(15000 / 1000)) + (12 * 5)
      // = 30 + 16 + 2 + 3 + 60 = 111
      expect(score).to.equal(111)
    })
  })
})
