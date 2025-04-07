import chai, { expect } from 'chai'
import chaiHttp from 'chai-http'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { exec } from 'child_process'
import { promisify } from 'util'

import server from '#server'
import db from '#db'
import {
  reset_all_tables,
  create_test_user,
  authenticate_request
} from '#tests/utils/index.mjs'

// Import GitHub webhook fixtures
import {
  pr_merged_webhook,
  pr_closed_without_merging_webhook
} from '#tests/fixtures/github/webhooks.mjs'

chai.use(chaiHttp)
const execute = promisify(exec)

describe('Change Requests API', () => {
  let test_user
  let test_repo_path
  let orig_cwd

  before(async () => {
    // Save original working directory
    orig_cwd = process.cwd()

    // Reset database tables
    await reset_all_tables()

    // Create a test user
    test_user = await create_test_user({
      email: 'test-cr-api@example.com',
      username: 'test_cr_api_user'
    })

    // Create temporary directory for test repo
    const temp_dir = os.tmpdir()
    test_repo_path = path.join(
      temp_dir,
      `cr-api-test-${Date.now()}-${Math.floor(Math.random() * 10000)}`
    )

    // Initialize test repo
    await fs.mkdir(test_repo_path, { recursive: true })
    await execute('git init', { cwd: test_repo_path })
    await execute('git config user.name "Test User"', { cwd: test_repo_path })
    await execute('git config user.email "test@example.com"', {
      cwd: test_repo_path
    })

    // Create initial commit
    await fs.writeFile(
      path.join(test_repo_path, 'README.md'),
      '# Test Repository'
    )
    await execute('git add README.md', { cwd: test_repo_path })
    await execute('git commit -m "Initial commit"', { cwd: test_repo_path })
    await execute('git branch -M main', { cwd: test_repo_path })

    // Create the change_requests directory
    await fs.mkdir(path.join(test_repo_path, 'data/change_requests'), {
      recursive: true
    })

    // Change to the test repo directory so git operations use this path
    process.chdir(test_repo_path)
  })

  after(async () => {
    // Restore original working directory
    process.chdir(orig_cwd)

    // Clean up the test repo
    try {
      await fs.rm(test_repo_path, { recursive: true, force: true })
    } catch (error) {
      console.error('Error cleaning up test repo:', error)
    }
  })

  describe('POST /api/change-requests', () => {
    it('should create a new change request', async () => {
      const request_body = {
        title: 'Test Integration CR',
        description: 'This is a test change request for API integration tests',
        target_branch: 'main',
        file_changes: [
          {
            path: 'test-api-file.md',
            content: '# Test API Content'
          }
        ],
        tags: ['test', 'api', 'integration']
      }

      const response = await authenticate_request(
        chai.request(server).post('/api/change-requests').send(request_body),
        test_user
      )

      expect(response).to.have.status(201)
      expect(response.body).to.have.property('change_request_id')
      expect(response.body).to.have.property('status', 'PendingReview')
      expect(response.body).to.have.property('title', request_body.title)

      // Verify the branch was created
      const cr_id = response.body.change_request_id
      const { stdout: branch_list } = await execute('git branch', {
        cwd: test_repo_path
      })
      expect(branch_list).to.include(`cr/${cr_id}`)

      // Verify the file was created
      const { stdout: file_list } = await execute(
        `git ls-tree -r --name-only cr/${cr_id}`,
        { cwd: test_repo_path }
      )
      expect(file_list).to.include('test-api-file.md')
    })

    it('should return 400 for missing required fields', async () => {
      const incomplete_request = {
        // Missing title
        description: 'This should fail',
        target_branch: 'main'
      }

      const response = await authenticate_request(
        chai
          .request(server)
          .post('/api/change-requests')
          .send(incomplete_request),
        test_user
      )

      expect(response).to.have.status(400)
      expect(response.body).to.have.property('error')
    })
  })

  describe('GET /api/change-requests/:id', () => {
    it('should retrieve a change request by ID', async () => {
      // First create a test CR
      const create_response = await authenticate_request(
        chai.request(server).post('/api/change-requests').send({
          title: 'Test Get CR',
          description: 'This is for testing GET endpoint',
          target_branch: 'main',
          file_changes: []
        }),
        test_user
      )

      expect(create_response).to.have.status(201)
      const change_request_id = create_response.body.change_request_id

      // Now get the CR by ID
      const get_response = await authenticate_request(
        chai.request(server).get(`/api/change-requests/${change_request_id}`),
        test_user
      )

      expect(get_response).to.have.status(200)
      expect(get_response.body).to.have.property(
        'change_request_id',
        change_request_id
      )
      expect(get_response.body).to.have.property('title', 'Test Get CR')
      expect(get_response.body).to.have.property(
        'description',
        'This is for testing GET endpoint'
      )
    })

    it('should return 404 for non-existent change request', async () => {
      const response = await authenticate_request(
        chai.request(server).get('/api/change-requests/non-existent-id'),
        test_user
      )

      expect(response).to.have.status(404)
    })
  })

  describe('GET /api/change-requests', () => {
    it('should list all change requests', async () => {
      // Create multiple test CRs
      const cr1 = await authenticate_request(
        chai.request(server).post('/api/change-requests').send({
          title: 'Test CR 1',
          description: 'First test CR',
          target_branch: 'main',
          file_changes: []
        }),
        test_user
      )

      const cr2 = await authenticate_request(
        chai.request(server).post('/api/change-requests').send({
          title: 'Test CR 2',
          description: 'Second test CR',
          target_branch: 'main',
          file_changes: []
        }),
        test_user
      )

      // Get list of CRs
      const response = await authenticate_request(
        chai.request(server).get('/api/change-requests'),
        test_user
      )

      expect(response).to.have.status(200)
      expect(response.body).to.be.an('array')
      expect(response.body.length).to.be.at.least(2)

      // Check that our created CRs are in the list
      const cr_ids = response.body.map((cr) => cr.change_request_id)
      expect(cr_ids).to.include(cr1.body.change_request_id)
      expect(cr_ids).to.include(cr2.body.change_request_id)
    })

    it('should filter change requests by status', async () => {
      // Create a CR
      const cr = await authenticate_request(
        chai.request(server).post('/api/change-requests').send({
          title: 'Test Filter CR',
          description: 'For testing filters',
          target_branch: 'main',
          file_changes: []
        }),
        test_user
      )

      // Update its status
      await authenticate_request(
        chai
          .request(server)
          .patch(`/api/change-requests/${cr.body.change_request_id}/status`)
          .send({ status: 'Approved' }),
        test_user
      )

      // Get list filtered by status
      const response = await authenticate_request(
        chai.request(server).get('/api/change-requests?status=Approved'),
        test_user
      )

      expect(response).to.have.status(200)
      expect(response.body).to.be.an('array')
      expect(response.body.length).to.be.at.least(1)

      // All should have Approved status
      response.body.forEach((cr) => {
        expect(cr.status).to.equal('Approved')
      })

      // Our CR should be in the list
      const cr_ids = response.body.map((cr) => cr.change_request_id)
      expect(cr_ids).to.include(cr.body.change_request_id)
    })
  })

  describe('PATCH /api/change-requests/:id/status', () => {
    it('should update the status of a change request', async () => {
      // Create a test CR
      const cr = await authenticate_request(
        chai.request(server).post('/api/change-requests').send({
          title: 'Test Status Update',
          description: 'For testing status updates',
          target_branch: 'main',
          file_changes: []
        }),
        test_user
      )

      // Update its status
      const update_response = await authenticate_request(
        chai
          .request(server)
          .patch(`/api/change-requests/${cr.body.change_request_id}/status`)
          .send({
            status: 'Approved',
            comment: 'Looks good to me!'
          }),
        test_user
      )

      expect(update_response).to.have.status(200)
      expect(update_response.body).to.have.property('status', 'Approved')

      // Verify the change by getting the CR
      const get_response = await authenticate_request(
        chai
          .request(server)
          .get(`/api/change-requests/${cr.body.change_request_id}`),
        test_user
      )

      expect(get_response.body).to.have.property('status', 'Approved')
      expect(get_response.body.content).to.include('Looks good to me!')

      // Verify the markdown file was updated
      const file_path = path.join(
        'data/change_requests',
        `${cr.body.change_request_id}.md`
      )
      const { stdout: file_content } = await execute(`cat ${file_path}`, {
        cwd: test_repo_path
      })
      expect(file_content).to.include('status: Approved')
      expect(file_content).to.include('Looks good to me!')
    })

    it('should return 400 for invalid status', async () => {
      // Create a test CR
      const cr = await authenticate_request(
        chai.request(server).post('/api/change-requests').send({
          title: 'Test Invalid Status',
          description: 'For testing invalid status',
          target_branch: 'main',
          file_changes: []
        }),
        test_user
      )

      // Try to update with invalid status
      const response = await authenticate_request(
        chai
          .request(server)
          .patch(`/api/change-requests/${cr.body.change_request_id}/status`)
          .send({
            status: 'InvalidStatus'
          }),
        test_user
      )

      expect(response).to.have.status(400)
      expect(response.body).to.have.property('error')
    })
  })

  describe('POST /api/change-requests/:id/merge', () => {
    it('should merge a change request', async () => {
      // Create a test CR with a file
      const cr = await authenticate_request(
        chai
          .request(server)
          .post('/api/change-requests')
          .send({
            title: 'Test Merge CR',
            description: 'For testing merge endpoint',
            target_branch: 'main',
            file_changes: [
              {
                path: 'merge-test.md',
                content: '# Test merge content'
              }
            ]
          }),
        test_user
      )

      // First approve it
      await authenticate_request(
        chai
          .request(server)
          .patch(`/api/change-requests/${cr.body.change_request_id}/status`)
          .send({ status: 'Approved' }),
        test_user
      )

      // Then merge it
      const merge_response = await authenticate_request(
        chai
          .request(server)
          .post(`/api/change-requests/${cr.body.change_request_id}/merge`)
          .send({
            merge_message: 'Merging test CR'
          }),
        test_user
      )

      expect(merge_response).to.have.status(200)
      expect(merge_response.body).to.have.property('status', 'Merged')

      // Verify the merge happened by checking if the file exists in main branch
      await execute('git checkout main', { cwd: test_repo_path })
      const { stdout: file_list } = await execute('ls -la', {
        cwd: test_repo_path
      })
      expect(file_list).to.include('merge-test.md')

      // Verify that the change request's status was updated in the database
      const get_response = await authenticate_request(
        chai
          .request(server)
          .get(`/api/change-requests/${cr.body.change_request_id}`),
        test_user
      )

      expect(get_response.body).to.have.property('status', 'Merged')
    })

    it('should return 400 for already merged CR', async () => {
      // Create, approve and merge a test CR
      const cr = await authenticate_request(
        chai
          .request(server)
          .post('/api/change-requests')
          .send({
            title: 'Test Already Merged',
            description: 'For testing double merge',
            target_branch: 'main',
            file_changes: [
              {
                path: 'already-merged.md',
                content: '# Already merged content'
              }
            ]
          }),
        test_user
      )

      await authenticate_request(
        chai
          .request(server)
          .patch(`/api/change-requests/${cr.body.change_request_id}/status`)
          .send({ status: 'Approved' }),
        test_user
      )

      await authenticate_request(
        chai
          .request(server)
          .post(`/api/change-requests/${cr.body.change_request_id}/merge`),
        test_user
      )

      // Try to merge again
      const response = await authenticate_request(
        chai
          .request(server)
          .post(`/api/change-requests/${cr.body.change_request_id}/merge`),
        test_user
      )

      expect(response).to.have.status(400)
      expect(response.body).to.have.property('error')
      expect(response.body.error).to.include('already merged')
    })
  })

  describe('POST /api/github/webhooks', () => {
    it('should handle GitHub PR merge webhook', async () => {
      // Create a test CR
      const cr_response = await authenticate_request(
        chai.request(server).post('/api/change-requests').send({
          title: 'Test GitHub Webhook',
          description: 'For testing GitHub webhooks',
          target_branch: 'main',
          file_changes: []
        }),
        test_user
      )

      // Manually update the CR to have a PR number
      await db('change_requests')
        .where({ change_request_id: cr_response.body.change_request_id })
        .update({
          github_pr_number: 123,
          github_repo: 'test-org/test-repo'
        })

      // Create a custom webhook payload that matches our PR number and repo
      const custom_webhook = {
        ...pr_merged_webhook,
        pull_request: {
          ...pr_merged_webhook.pull_request,
          number: 123
        },
        repository: {
          ...pr_merged_webhook.repository,
          full_name: 'test-org/test-repo'
        }
      }

      // Send merge webhook payload
      const response = await chai
        .request(server)
        .post('/api/github/webhooks')
        .set('Content-Type', 'application/json')
        .set('X-GitHub-Event', 'pull_request')
        .send(JSON.stringify(custom_webhook))

      expect(response).to.have.status(200)

      // Verify CR status was updated
      const updated_cr = await authenticate_request(
        chai
          .request(server)
          .get(`/api/change-requests/${cr_response.body.change_request_id}`),
        test_user
      )

      expect(updated_cr.body).to.have.property('status', 'Merged')
    })

    it('should handle GitHub PR closed without merge webhook', async () => {
      // Create a test CR
      const cr_response = await authenticate_request(
        chai.request(server).post('/api/change-requests').send({
          title: 'Test GitHub Close Webhook',
          description: 'For testing GitHub close webhooks',
          target_branch: 'main',
          file_changes: []
        }),
        test_user
      )

      // Manually update the CR to have a PR number
      await db('change_requests')
        .where({ change_request_id: cr_response.body.change_request_id })
        .update({
          github_pr_number: 456,
          github_repo: 'test-org/test-repo'
        })

      // Create a custom webhook payload
      const custom_webhook = {
        ...pr_closed_without_merging_webhook,
        number: 456,
        pull_request: {
          ...pr_closed_without_merging_webhook.pull_request,
          number: 456
        },
        repository: {
          ...pr_closed_without_merging_webhook.repository,
          full_name: 'test-org/test-repo'
        }
      }

      // Send close webhook payload
      const response = await chai
        .request(server)
        .post('/api/github/webhooks')
        .set('Content-Type', 'application/json')
        .set('X-GitHub-Event', 'pull_request')
        .send(JSON.stringify(custom_webhook))

      expect(response).to.have.status(200)

      // Verify CR status was updated
      const updated_cr = await authenticate_request(
        chai
          .request(server)
          .get(`/api/change-requests/${cr_response.body.change_request_id}`),
        test_user
      )

      expect(updated_cr.body).to.have.property('status', 'Closed')
    })
  })
}).timeout(30000)
