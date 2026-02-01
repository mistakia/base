import { expect } from 'chai'
import { describe, it } from 'mocha'

import { TASK_STATUS } from '#libs-shared/task-constants.mjs'
import {
  format_status,
  normalize_github_issue
} from '#libs-server/integrations/github/normalize-github-issue.mjs'

describe('normalize-github-issue', () => {
  describe('format_status', () => {
    it('should map "abandoned" to ABANDONED', () => {
      expect(format_status('abandoned')).to.equal(TASK_STATUS.ABANDONED)
    })

    it('should map "Abandoned" to ABANDONED', () => {
      expect(format_status('Abandoned')).to.equal(TASK_STATUS.ABANDONED)
    })

    it('should map "cancelled" to ABANDONED', () => {
      expect(format_status('cancelled')).to.equal(TASK_STATUS.ABANDONED)
    })

    it('should map "canceled" to ABANDONED', () => {
      expect(format_status('canceled')).to.equal(TASK_STATUS.ABANDONED)
    })

    it('should map "completed" to COMPLETED', () => {
      expect(format_status('completed')).to.equal(TASK_STATUS.COMPLETED)
    })

    it('should map "in progress" to IN_PROGRESS', () => {
      expect(format_status('in progress')).to.equal(TASK_STATUS.IN_PROGRESS)
    })

    it('should return NO_STATUS for null/undefined', () => {
      expect(format_status(null)).to.equal(TASK_STATUS.NO_STATUS)
      expect(format_status(undefined)).to.equal(TASK_STATUS.NO_STATUS)
    })
  })

  describe('normalize_github_issue guard logic', () => {
    const base_params = {
      external_id: 'github:test/repo:1',
      github_repository_owner: 'test',
      github_repository_name: 'repo',
      user_public_key: 'test-key'
    }

    function make_project_item(status_name) {
      return {
        id: 'PVTI_test',
        fieldValues: {
          nodes: [
            {
              field: { name: 'Status' },
              name: status_name
            }
          ]
        }
      }
    }

    it('should preserve ABANDONED status for closed issues with project status "Abandoned"', () => {
      const result = normalize_github_issue({
        ...base_params,
        issue: {
          title: 'Test',
          state: 'closed',
          closed_at: '2026-01-01T00:00:00Z',
          number: 1
        },
        project_item: make_project_item('Abandoned')
      })

      expect(result.status).to.equal(TASK_STATUS.ABANDONED)
    })

    it('should preserve COMPLETED status for closed issues with project status "Completed"', () => {
      const result = normalize_github_issue({
        ...base_params,
        issue: {
          title: 'Test',
          state: 'closed',
          closed_at: '2026-01-01T00:00:00Z',
          number: 2
        },
        project_item: make_project_item('Completed')
      })

      expect(result.status).to.equal(TASK_STATUS.COMPLETED)
    })

    it('should fall back to COMPLETED for closed issues with stale project status "In Progress"', () => {
      const result = normalize_github_issue({
        ...base_params,
        issue: {
          title: 'Test',
          state: 'closed',
          closed_at: '2026-01-01T00:00:00Z',
          number: 3
        },
        project_item: make_project_item('In Progress')
      })

      expect(result.status).to.equal(TASK_STATUS.COMPLETED)
    })

    it('should default to COMPLETED for closed issues without project item', () => {
      const result = normalize_github_issue({
        ...base_params,
        issue: {
          title: 'Test',
          state: 'closed',
          closed_at: '2026-01-01T00:00:00Z',
          number: 4
        }
      })

      expect(result.status).to.equal(TASK_STATUS.COMPLETED)
    })
  })
})
