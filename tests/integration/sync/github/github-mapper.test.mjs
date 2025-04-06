import { expect } from 'chai'
import {
  create_test_user,
  create_temp_test_directory
} from '#tests/utils/index.mjs'
import db from '#db'
import { TASK_STATUS, TASK_PRIORITY } from '#libs-shared/task-constants.mjs'
import {
  map_status,
  map_priority,
  extract_project_fields,
  normalize_github_issue
} from '#libs-server/integrations/github/github-mapper.mjs'

// Set up temp directory for imports
const temp_dir = create_temp_test_directory('github-mapper-test-')

// Before tests begin, set environment variable to use our temp directory
process.env.IMPORT_HISTORY_DIR = temp_dir.path

describe('GitHub Mapper Integration Tests', () => {
  let test_user

  // Set up test environment
  before(async () => {
    // Create test user
    test_user = await create_test_user()
  })

  // Clean up after all tests
  after(async () => {
    // Clean up all test entities for the test user
    await db('entities').where({ user_id: test_user.user_id }).delete()

    // Clean up temporary directory
    if (temp_dir) {
      temp_dir.cleanup()
    }

    // Reset environment variable
    delete process.env.IMPORT_HISTORY_DIR
  })

  describe('map_status', () => {
    it('should map GitHub issue state to internal task status', () => {
      // Open issue -> In Progress
      expect(map_status({ data: { state: 'open' } })).to.equal(
        TASK_STATUS.NO_STATUS
      )

      // Closed issue -> Done
      expect(map_status({ data: { state: 'closed' } })).to.equal(
        TASK_STATUS.COMPLETED
      )
    })

    it('should detect status from GitHub labels', () => {
      // Open issue with "In Progress" label -> In Progress
      expect(
        map_status({
          data: {
            state: 'open',
            labels: [{ name: 'In Progress' }]
          }
        })
      ).to.equal(TASK_STATUS.IN_PROGRESS)

      // Open issue with "Done" label -> Done (unusual but possible)
      expect(
        map_status({
          data: {
            state: 'open',
            labels: [{ name: 'Done' }]
          }
        })
      ).to.equal(TASK_STATUS.NO_STATUS)

      // Closed issue with any label -> Done (closed state takes precedence)
      expect(
        map_status({
          data: {
            state: 'closed',
            labels: [{ name: 'In Progress' }]
          }
        })
      ).to.equal(TASK_STATUS.COMPLETED)
    })

    it('should map internal task status to GitHub issue state', () => {
      // Test mapping from internal to GitHub
      const completed_task = { status: TASK_STATUS.COMPLETED }
      expect(
        map_status({ data: completed_task, direction: 'to_external' })
      ).to.equal('closed')

      const cancelled_task = { status: TASK_STATUS.CANCELLED }
      expect(
        map_status({ data: cancelled_task, direction: 'to_external' })
      ).to.equal('closed')

      const other_status_task = { status: TASK_STATUS.IN_PROGRESS }
      expect(
        map_status({ data: other_status_task, direction: 'to_external' })
      ).to.equal('open')

      const no_status_task = { status: TASK_STATUS.NO_STATUS }
      expect(
        map_status({ data: no_status_task, direction: 'to_external' })
      ).to.equal('open')
    })
  })

  describe('map_priority', () => {
    it('should map GitHub labels to internal task priority', () => {
      // Test mapping from GitHub to internal
      const issue_with_no_labels = {
        labels: []
      }
      expect(
        map_priority({ data: issue_with_no_labels, direction: 'to_internal' })
      ).to.equal(TASK_PRIORITY.NONE)

      const issue_with_priority_label = {
        labels: [{ name: 'bug' }, { name: 'priority:high' }]
      }
      expect(
        map_priority({
          data: issue_with_priority_label,
          direction: 'to_internal'
        })
      ).to.equal(TASK_PRIORITY.HIGH)

      const issue_with_priority_slash = {
        labels: [{ name: 'bug' }, { name: 'priority/low' }]
      }
      expect(
        map_priority({
          data: issue_with_priority_slash,
          direction: 'to_internal'
        })
      ).to.equal(TASK_PRIORITY.LOW)

      const issue_with_direct_priority = {
        labels: [{ name: 'bug' }, { name: 'critical' }]
      }
      expect(
        map_priority({
          data: issue_with_direct_priority,
          direction: 'to_internal'
        })
      ).to.equal(TASK_PRIORITY.CRITICAL)
    })

    it('should map internal task priority to GitHub labels', () => {
      // Test mapping from internal to GitHub
      const no_priority_task = { priority: TASK_PRIORITY.NONE }
      expect(
        map_priority({ data: no_priority_task, direction: 'to_external' })
      ).to.deep.equal([])

      const high_priority_task = { priority: TASK_PRIORITY.HIGH }
      expect(
        map_priority({ data: high_priority_task, direction: 'to_external' })
      ).to.deep.equal(['priority/high'])

      const critical_priority_task = { priority: TASK_PRIORITY.CRITICAL }
      expect(
        map_priority({ data: critical_priority_task, direction: 'to_external' })
      ).to.deep.equal(['priority/critical'])
    })
  })

  describe('extract_project_fields', () => {
    it('should extract fields from GitHub project item', () => {
      const project_item = {
        id: 'project_item_123',
        fieldValues: {
          nodes: [
            {
              field: {
                name: 'Status'
              },
              name: 'In Progress'
            },
            {
              field: {
                name: 'Priority'
              },
              name: 'High'
            },
            {
              field: {
                name: 'Due Date'
              },
              date: '2023-07-15'
            }
          ]
        }
      }

      const fields = extract_project_fields(project_item)

      expect(fields).to.be.an('object')
      expect(fields).to.have.property('status', TASK_STATUS.IN_PROGRESS)
      expect(fields).to.have.property('priority', TASK_PRIORITY.HIGH)
      expect(fields).to.have.property('finish_by', '2023-07-15')
    })

    it('should return empty object when project_item is null', () => {
      const fields = extract_project_fields(null)
      expect(fields).to.be.an('object')
      expect(Object.keys(fields)).to.have.lengthOf(0)
    })

    it('should handle alternative field names', () => {
      const project_item = {
        id: 'project_item_123',
        fieldValues: {
          nodes: [
            {
              field: {
                name: 'finish_by'
              },
              date: '2023-08-01'
            },
            {
              field: {
                name: 'start_by'
              },
              date: '2023-07-01'
            }
          ]
        }
      }

      const fields = extract_project_fields(project_item)

      expect(fields).to.be.an('object')
      expect(fields).to.have.property('finish_by', '2023-08-01')
      expect(fields).to.have.property('start_by', '2023-07-01')
    })
  })

  describe('normalize_github_issue', () => {
    it('should normalize basic GitHub issue data', () => {
      const issue = {
        id: 12345,
        number: 42,
        title: 'Test Issue',
        body: 'Test Description',
        state: 'open',
        html_url: 'https://github.com/test/repo/issues/42',
        created_at: '2023-01-01T12:00:00Z',
        updated_at: '2023-01-02T12:00:00Z',
        labels: []
      }

      const normalized = normalize_github_issue({
        issue,
        repo_owner: 'test',
        repo_name: 'repo'
      })

      expect(normalized).to.be.an('object')
      expect(normalized).to.have.property('title', 'Test Issue')
      expect(normalized).to.have.property('description', 'Test Description')
      expect(normalized).to.have.property('status', TASK_STATUS.NO_STATUS)
      expect(normalized).to.have.property('github_id', 12345)
      expect(normalized).to.have.property('github_number', 42)
      expect(normalized).to.have.property(
        'github_url',
        'https://github.com/test/repo/issues/42'
      )
      expect(normalized).to.have.property('repo_full_name', 'test/repo')
      expect(normalized).to.have.property('created_at')
    })

    it('should include finished_at for closed issues', () => {
      const closed_issue = {
        id: 12346,
        number: 124,
        title: 'Closed Test Issue',
        body: 'This is a closed test issue',
        state: 'closed',
        html_url: 'https://github.com/test-owner/test-repo/issues/124',
        created_at: '2023-01-01T12:00:00Z',
        updated_at: '2023-01-03T10:00:00Z',
        closed_at: '2023-01-03T10:00:00Z',
        labels: []
      }

      const normalized = normalize_github_issue({
        issue: closed_issue,
        repo_owner: 'test-owner',
        repo_name: 'test-repo'
      })

      expect(normalized).to.have.property('status', TASK_STATUS.COMPLETED)
      expect(normalized).to.have.property('finished_at', closed_issue.closed_at)
    })

    it('should extract status and priority from labels', () => {
      const issue_with_labels = {
        id: 12347,
        number: 125,
        title: 'Issue with Labels',
        body: 'This issue has status and priority labels',
        state: 'open',
        html_url: 'https://github.com/test-owner/test-repo/issues/125',
        created_at: '2023-01-01T12:00:00Z',
        updated_at: '2023-01-02T14:30:00Z',
        closed_at: null,
        labels: [
          { name: 'bug' },
          { name: 'status:blocked' },
          { name: 'priority:high' }
        ]
      }

      const normalized = normalize_github_issue({
        issue: issue_with_labels,
        repo_owner: 'test-owner',
        repo_name: 'test-repo'
      })

      expect(normalized).to.have.property('status', TASK_STATUS.BLOCKED)
      expect(normalized).to.have.property('priority', TASK_PRIORITY.HIGH)
    })

    it('should override with project fields when available', () => {
      const issue = {
        id: 12345,
        number: 42,
        title: 'Test Issue with Project Fields',
        body: 'Test Description',
        state: 'open',
        html_url: 'https://github.com/test/repo/issues/42',
        created_at: '2023-01-01T12:00:00Z',
        updated_at: '2023-01-02T12:00:00Z',
        labels: [{ name: 'High Priority' }]
      }

      const project_fields = {
        status: TASK_STATUS.STARTED,
        estimate: '3',
        finish_by: '2023-05-01T00:00:00Z'
      }

      const normalized = normalize_github_issue({
        issue,
        repo_owner: 'test',
        repo_name: 'repo',
        project_fields
      })

      expect(normalized).to.be.an('object')
      expect(normalized).to.have.property(
        'title',
        'Test Issue with Project Fields'
      )
      expect(normalized).to.have.property('status', TASK_STATUS.STARTED) // Status from project fields
      expect(normalized).to.have.property('estimate', '3') // Estimate from project fields
      expect(normalized).to.have.property('finish_by', '2023-05-01T00:00:00Z') // Due date from project fields
      expect(normalized).to.have.property('priority', TASK_PRIORITY.HIGH) // Priority from labels
    })

    it('should set repo_full_name from issue repository when not provided', () => {
      const issue = {
        id: 12348,
        number: 126,
        title: 'Issue with Repository',
        body: 'This issue has repository info',
        state: 'open',
        html_url: 'https://github.com/repo-owner/repo-name/issues/126',
        created_at: '2023-01-01T12:00:00Z',
        updated_at: '2023-01-02T14:30:00Z',
        repository: {
          name: 'repo-name',
          owner: {
            login: 'repo-owner'
          }
        },
        labels: []
      }

      const normalized = normalize_github_issue({
        issue
      })

      expect(normalized).to.have.property(
        'repo_full_name',
        'repo-owner/repo-name'
      )
    })

    it('should handle project item fields', () => {
      const issue = {
        id: 12349,
        number: 127,
        title: 'Issue with Project Item',
        body: 'This issue has project item info',
        state: 'open',
        html_url: 'https://github.com/test/repo/issues/127',
        created_at: '2023-01-01T12:00:00Z',
        updated_at: '2023-01-02T14:30:00Z',
        labels: []
      }

      const project_item = {
        id: 'project_item_456',
        fieldValues: {
          nodes: [
            {
              field: {
                name: 'Status'
              },
              name: 'In Progress'
            },
            {
              field: {
                name: 'Priority'
              },
              name: 'High'
            }
          ]
        }
      }

      const normalized = normalize_github_issue({
        issue,
        repo_owner: 'test',
        repo_name: 'repo',
        project_item
      })

      expect(normalized).to.have.property('status', TASK_STATUS.IN_PROGRESS)
      expect(normalized).to.have.property('priority', TASK_PRIORITY.HIGH)
      expect(normalized).to.have.property(
        'github_project_item_id',
        'project_item_456'
      )
    })

    it('should throw error when issue is not provided', () => {
      expect(() => normalize_github_issue({})).to.throw(
        'Missing issue data for normalization'
      )
    })
  })
})
