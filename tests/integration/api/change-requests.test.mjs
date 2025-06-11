import chai, { expect } from 'chai'
import chaiHttp from 'chai-http'
import fs from 'fs/promises'
import path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'

import server from '#server'
import db from '#db'
import {
  reset_all_tables,
  create_test_user,
  create_test_thread,
  authenticate_request,
  create_temp_test_repo
} from '#tests/utils/index.mjs'
import { clear_registered_directories } from '#libs-server/base-uri/index.mjs'

// Import GitHub webhook fixtures
import {
  pr_merged_webhook,
  pr_closed_without_merging_webhook
} from '#tests/fixtures/github/webhooks.mjs'

chai.use(chaiHttp)
const execute = promisify(exec)

describe('Change Requests API', () => {
  let test_user
  let test_thread
  let test_directories

  before(async () => {
    // Reset database tables
    await reset_all_tables()

    // Create a test user
    test_user = await create_test_user({
      email: 'test-cr-api@example.com',
      username: 'test_cr_api_user'
    })

    // Setup test directories with proper repository structure
    const test_repo = await create_temp_test_repo({
      prefix: 'cr-test-repo-',
      initial_content: '# Test Change Request Repository',
      register_directories: true
    })
    test_directories = {
      system_path: test_repo.system_path,
      user_path: test_repo.user_path,
      cleanup: test_repo.cleanup
    }

    // Create a test thread with the test directories
    test_thread = await create_test_thread({
      user_id: test_user.user_id,
      test_directories,
      create_git_branches: true,
      create_change_request: true
    })

    // Create the change_requests directory
    await fs.mkdir(path.join(test_directories.user_path, 'change-request'), {
      recursive: true
    })
  })

  after(async () => {
    // Clean up registry and repositories
    clear_registered_directories()
    if (test_thread && test_thread.cleanup) {
      test_thread.cleanup()
    }
    if (test_directories && test_directories.cleanup) {
      test_directories.cleanup()
    }
  })

  describe('GET /api/change-requests/:id', () => {
    it('should retrieve a change request by ID', async () => {
      // Create a test thread with default change request
      const thread_data = await create_test_thread({
        user_id: test_user.user_id,
        thread_main_request: 'Test Get CR - This is for testing GET endpoint',
        test_directories,
        create_git_branches: true,
        create_change_request: true
      })

      // Fetch the change request ID from the thread
      const change_request = await db('change_requests')
        .where({ thread_id: thread_data.thread_id })
        .first()

      const change_request_id = change_request.change_request_id

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
      expect(get_response.body).to.have.property('title')
      expect(get_response.body.title).to.include(
        `Thread ${thread_data.thread_id}`
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
      // Create multiple test threads with default change requests
      const thread1 = await create_test_thread({
        user_id: test_user.user_id,
        thread_main_request: 'First test CR',
        test_directories,
        create_git_branches: true,
        create_change_request: true
      })

      const thread2 = await create_test_thread({
        user_id: test_user.user_id,
        thread_main_request: 'Second test CR',
        test_directories,
        create_git_branches: true,
        create_change_request: true
      })

      // Fetch the change request IDs
      const cr1 = await db('change_requests')
        .where({ thread_id: thread1.thread_id })
        .first()

      const cr2 = await db('change_requests')
        .where({ thread_id: thread2.thread_id })
        .first()

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
      expect(cr_ids).to.include(cr1.change_request_id)
      expect(cr_ids).to.include(cr2.change_request_id)
    })

    it('should filter change requests by status', async () => {
      // Create a thread with default change request
      const thread_data = await create_test_thread({
        user_id: test_user.user_id,
        thread_main_request: 'For testing filters',
        test_directories,
        create_git_branches: true,
        create_change_request: true
      })

      // Fetch the change request
      const cr = await db('change_requests')
        .where({ thread_id: thread_data.thread_id })
        .first()

      // Update its status
      await authenticate_request(
        chai
          .request(server)
          .patch(`/api/change-requests/${cr.change_request_id}/status`)
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
      expect(cr_ids).to.include(cr.change_request_id)
    })
  })

  describe('PATCH /api/change-requests/:id/status', () => {
    it('should update the status of a change request', async () => {
      // Create a thread with default change request
      const thread_data = await create_test_thread({
        user_id: test_user.user_id,
        thread_main_request: 'For testing status updates',
        test_directories,
        create_git_branches: true,
        create_change_request: true
      })

      // Fetch the change request
      const cr = await db('change_requests')
        .where({ thread_id: thread_data.thread_id })
        .first()

      // Update its status
      const update_response = await authenticate_request(
        chai
          .request(server)
          .patch(`/api/change-requests/${cr.change_request_id}/status`)
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
          .get(`/api/change-requests/${cr.change_request_id}`),
        test_user
      )

      expect(get_response.body).to.have.property('status', 'Approved')
      expect(get_response.body.content).to.include('Looks good to me!')

      // Verify the markdown file was updated
      const file_path = path.join(
        test_directories.user_path,
        'change-request',
        `${cr.change_request_id}.md`
      )
      const { stdout: file_content } = await execute(`cat ${file_path}`, {
        cwd: test_directories.user_path
      })
      expect(file_content).to.include('status: Approved')
      expect(file_content).to.include('Looks good to me!')
    })

    it('should return 400 for invalid status', async () => {
      // Create a thread with default change request
      const thread_data = await create_test_thread({
        user_id: test_user.user_id,
        thread_main_request: 'For testing invalid status',
        test_directories,
        create_git_branches: true,
        create_change_request: true
      })

      // Fetch the change request
      const cr = await db('change_requests')
        .where({ thread_id: thread_data.thread_id })
        .first()

      // Try to update with invalid status
      const response = await authenticate_request(
        chai
          .request(server)
          .patch(`/api/change-requests/${cr.change_request_id}/status`)
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
      // Create a thread with default change request and add a file
      const thread_data = await create_test_thread({
        user_id: test_user.user_id,
        thread_main_request: 'For testing merge endpoint',
        test_directories,
        create_git_branches: true,
        create_change_request: true
      })

      // Create a file in the thread worktree (not by checking out the branch)
      const worktree_path = thread_data.thread.user_worktree_path
      await fs.writeFile(
        path.join(worktree_path, 'merge-test.md'),
        '# Test merge content'
      )
      await execute('git add merge-test.md', {
        cwd: worktree_path
      })
      await execute("git commit -m 'Add merge test file'", {
        cwd: worktree_path
      })

      // Fetch the change request
      const cr = await db('change_requests')
        .where({ thread_id: thread_data.thread_id })
        .first()

      // First approve it
      await authenticate_request(
        chai
          .request(server)
          .patch(`/api/change-requests/${cr.change_request_id}/status`)
          .send({ status: 'Approved' }),
        test_user
      )

      // Then merge it
      const merge_response = await authenticate_request(
        chai
          .request(server)
          .post(`/api/change-requests/${cr.change_request_id}/merge`)
          .send({
            merge_message: 'Merging test CR'
          }),
        test_user
      )

      expect(merge_response).to.have.status(200)
      expect(merge_response.body).to.have.property('status', 'Merged')

      // Verify the merge happened by checking if the file exists in main branch
      await execute('git checkout main', {
        cwd: test_directories.user_path
      })
      const { stdout: file_list } = await execute('ls -la', {
        cwd: test_directories.user_path
      })
      expect(file_list).to.include('merge-test.md')

      // Verify that the change request's status was updated in the database
      const get_response = await authenticate_request(
        chai
          .request(server)
          .get(`/api/change-requests/${cr.change_request_id}`),
        test_user
      )

      expect(get_response.body).to.have.property('status', 'Merged')
    })

    it('should return 400 for already merged CR', async () => {
      // Create a thread with default change request and add a file
      const thread_data = await create_test_thread({
        user_id: test_user.user_id,
        thread_main_request: 'For testing double merge',
        test_directories,
        create_git_branches: true,
        create_change_request: true
      })

      // Create a file in the thread worktree (not by checking out the branch)
      const worktree_path = thread_data.thread.user_worktree_path
      await fs.writeFile(
        path.join(worktree_path, 'already-merged.md'),
        '# Already merged content'
      )
      await execute('git add already-merged.md', {
        cwd: worktree_path
      })
      await execute("git commit -m 'Add already merged file'", {
        cwd: worktree_path
      })

      // Fetch the change request
      const cr = await db('change_requests')
        .where({ thread_id: thread_data.thread_id })
        .first()

      await authenticate_request(
        chai
          .request(server)
          .patch(`/api/change-requests/${cr.change_request_id}/status`)
          .send({ status: 'Approved' }),
        test_user
      )

      await authenticate_request(
        chai
          .request(server)
          .post(`/api/change-requests/${cr.change_request_id}/merge`),
        test_user
      )

      // Try to merge again
      const response = await authenticate_request(
        chai
          .request(server)
          .post(`/api/change-requests/${cr.change_request_id}/merge`),
        test_user
      )

      expect(response).to.have.status(400)
      expect(response.body).to.have.property('error')
      expect(response.body.error).to.include(
        'Cannot merge change request with status: Merged'
      )
    })
  })

  describe('POST /api/github/webhooks', () => {
    it('should handle GitHub PR merge webhook', async () => {
      // Create a thread with default change request
      const thread_data = await create_test_thread({
        user_id: test_user.user_id,
        thread_main_request: 'For testing GitHub webhooks',
        test_directories,
        create_git_branches: true,
        create_change_request: true
      })

      // Fetch the change request
      const cr = await db('change_requests')
        .where({ thread_id: thread_data.thread_id })
        .first()

      // Manually update the CR to have a PR number
      await db('change_requests')
        .where({ change_request_id: cr.change_request_id })
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
        .send(custom_webhook)

      expect(response).to.have.status(200)

      // Verify CR status was updated
      const updated_cr = await authenticate_request(
        chai
          .request(server)
          .get(`/api/change-requests/${cr.change_request_id}`),
        test_user
      )

      expect(updated_cr.body).to.have.property('status', 'Merged')
    })

    it('should handle GitHub PR closed without merge webhook', async () => {
      // Create a thread with default change request
      const thread_data = await create_test_thread({
        user_id: test_user.user_id,
        thread_main_request: 'For testing GitHub close webhooks',
        test_directories,
        create_git_branches: true,
        create_change_request: true
      })

      // Fetch the change request
      const cr = await db('change_requests')
        .where({ thread_id: thread_data.thread_id })
        .first()

      // Manually update the CR to have a PR number
      await db('change_requests')
        .where({ change_request_id: cr.change_request_id })
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
        .send(custom_webhook)

      expect(response).to.have.status(200)

      // Verify CR status was updated
      const updated_cr = await authenticate_request(
        chai
          .request(server)
          .get(`/api/change-requests/${cr.change_request_id}`),
        test_user
      )

      expect(updated_cr.body).to.have.property('status', 'Closed')
    })
  })
}).timeout(30000)
