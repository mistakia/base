/* global describe it */
import { expect } from 'chai'

import { calculate_activity_score } from '#libs-server/activity/calculate-activity-score.mjs'
import { merge_activity_and_calculate_scores } from '#libs-server/activity/index.mjs'

describe('Task Activity', () => {
  describe('calculate_activity_score with task metrics', () => {
    it('should include tasks_completed in score', () => {
      const score = calculate_activity_score({ tasks_completed: 3 })
      // 3 * 20 = 60
      expect(score).to.equal(60)
    })

    it('should include tasks_created in score', () => {
      const score = calculate_activity_score({ tasks_created: 5 })
      // 5 * 3 = 15
      expect(score).to.equal(15)
    })

    it('should combine task and other metrics', () => {
      const score = calculate_activity_score({
        activity_git_commits: 2,
        tasks_completed: 1,
        tasks_created: 2
      })
      // (2 * 10) + (1 * 20) + (2 * 3) = 20 + 20 + 6 = 46
      expect(score).to.equal(46)
    })

    it('should default task metrics to 0', () => {
      const score = calculate_activity_score({
        activity_git_commits: 1
      })
      // 1 * 10 = 10 (no task contribution)
      expect(score).to.equal(10)
    })
  })

  describe('merge_activity_and_calculate_scores with task_activity', () => {
    it('should merge task activity into combined entries', () => {
      const result = merge_activity_and_calculate_scores({
        git_activity: [
          {
            date: '2026-01-15',
            activity_git_commits: 3,
            activity_git_lines_changed: 100,
            activity_git_files_changed: 2
          }
        ],
        thread_activity: [],
        task_activity: [
          { date: '2026-01-15', tasks_created: 2, tasks_completed: 1 }
        ],
        days: 30
      })

      expect(result.data).to.have.lengthOf(1)
      const entry = result.data[0]
      expect(entry.tasks_created).to.equal(2)
      expect(entry.tasks_completed).to.equal(1)
      expect(entry.activity_git_commits).to.equal(3)
    })

    it('should create entries for task-only dates', () => {
      const result = merge_activity_and_calculate_scores({
        git_activity: [
          {
            date: '2026-01-10',
            activity_git_commits: 1,
            activity_git_lines_changed: 50,
            activity_git_files_changed: 1
          }
        ],
        thread_activity: [],
        task_activity: [
          { date: '2026-01-12', tasks_created: 3, tasks_completed: 0 }
        ],
        days: 30
      })

      expect(result.data).to.have.lengthOf(2)
      const task_only = result.data.find((e) => e.date === '2026-01-12')
      expect(task_only.tasks_created).to.equal(3)
      expect(task_only.activity_git_commits).to.equal(0)
    })

    it('should initialize task fields to 0 when not present', () => {
      const result = merge_activity_and_calculate_scores({
        git_activity: [
          {
            date: '2026-01-10',
            activity_git_commits: 1,
            activity_git_lines_changed: 50,
            activity_git_files_changed: 1
          }
        ],
        thread_activity: [],
        task_activity: [],
        days: 30
      })

      expect(result.data).to.have.lengthOf(1)
      expect(result.data[0].tasks_created).to.equal(0)
      expect(result.data[0].tasks_completed).to.equal(0)
    })

    it('should work without task_activity parameter', () => {
      const result = merge_activity_and_calculate_scores({
        git_activity: [],
        thread_activity: [],
        days: 30
      })

      expect(result.data).to.have.lengthOf(0)
    })

    it('should include task scores in max_score', () => {
      const result = merge_activity_and_calculate_scores({
        git_activity: [],
        thread_activity: [],
        task_activity: [
          { date: '2026-01-15', tasks_created: 0, tasks_completed: 5 }
        ],
        days: 30
      })

      // 5 * 20 = 100
      expect(result.max_score).to.equal(100)
    })
  })
})
