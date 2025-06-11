import chai, { expect } from 'chai'
import chaiHttp from 'chai-http'

import server from '#server'
import db from '#db'
import {
  reset_all_tables,
  create_test_user,
  create_test_thread,
  create_temp_test_repo
} from '#tests/utils/index.mjs'
import {
  clear_registered_directories,
  get_user_base_directory
} from '#libs-server/base-uri/index.mjs'

// Import GitHub webhook fixtures
import {
  pr_merged_webhook,
  pr_closed_without_merging_webhook
} from '#tests/fixtures/github/webhooks.mjs'

chai.use(chaiHttp)

describe('GitHub Webhooks with Registry System', () => {
  let test_user
  let test_directories

  before(async () => {
    // Clear any existing registry
    clear_registered_directories()

    // Reset database tables
    await reset_all_tables()

    // Create a test user
    test_user = await create_test_user({
      email: 'github-webhook-registry@example.com',
      username: 'github_webhook_registry_user'
    })

    // Setup test directories with proper repository structure
    const test_repo = await create_temp_test_repo({
      prefix: 'github-webhook-registry-',
      initial_content: '# GitHub Webhook Registry Test Repository',
      register_directories: true
    })
    test_directories = {
      system_path: test_repo.system_path,
      user_path: test_repo.user_path,
      cleanup: test_repo.cleanup
    }
  })

  after(async () => {
    // Clean up registry and repositories
    clear_registered_directories()
    if (test_directories && test_directories.cleanup) {
      test_directories.cleanup()
    }
  })

  describe('Registry Integration', () => {
    it('should verify registry is properly configured', async () => {
      // Verify that the registry has the correct user base directory
      const registered_user_dir = get_user_base_directory()
      expect(registered_user_dir).to.equal(test_directories.user_path)
    })

    it('should handle GitHub PR merge webhook using registry', async () => {
      // Create a thread with default change request
      const thread_data = await create_test_thread({
        user_id: test_user.user_id,
        thread_main_request: 'Testing GitHub webhook with registry system',
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
          github_pr_number: 999,
          github_repo: 'registry-test/test-repo'
        })

      // Create a custom webhook payload that matches our PR number and repo
      const custom_webhook = {
        ...pr_merged_webhook,
        number: 999,
        pull_request: {
          ...pr_merged_webhook.pull_request,
          number: 999,
          merged: true
        },
        repository: {
          ...pr_merged_webhook.repository,
          full_name: 'registry-test/test-repo'
        }
      }

      // Send merge webhook payload - note: no user_base_directory query parameter
      const response = await chai
        .request(server)
        .post('/api/github/webhooks')
        .set('Content-Type', 'application/json')
        .set('X-GitHub-Event', 'pull_request')
        .send(custom_webhook)

      expect(response).to.have.status(200)
      expect(response.body).to.have.property('ok', true)
      expect(response.body).to.have.property('change_request_id')
      expect(response.body).to.have.property('status', 'Merged')

      // Verify CR status was updated in the database
      const updated_cr = await db('change_requests')
        .where({ change_request_id: cr.change_request_id })
        .first()

      expect(updated_cr.status).to.equal('Merged')
      expect(updated_cr.merged_at).to.exist
    })

    it('should handle GitHub PR closed webhook using registry', async () => {
      // Create a thread with default change request
      const thread_data = await create_test_thread({
        user_id: test_user.user_id,
        thread_main_request: 'Testing GitHub close webhook with registry',
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
          github_pr_number: 888,
          github_repo: 'registry-test/close-repo'
        })

      // Create a custom webhook payload
      const custom_webhook = {
        ...pr_closed_without_merging_webhook,
        number: 888,
        pull_request: {
          ...pr_closed_without_merging_webhook.pull_request,
          number: 888,
          merged: false
        },
        repository: {
          ...pr_closed_without_merging_webhook.repository,
          full_name: 'registry-test/close-repo'
        }
      }

      // Send close webhook payload - note: no user_base_directory query parameter
      const response = await chai
        .request(server)
        .post('/api/github/webhooks')
        .set('Content-Type', 'application/json')
        .set('X-GitHub-Event', 'pull_request')
        .send(custom_webhook)

      expect(response).to.have.status(200)
      expect(response.body).to.have.property('ok', true)
      expect(response.body).to.have.property('change_request_id')
      expect(response.body).to.have.property('status', 'Closed')

      // Verify CR status was updated in the database
      const updated_cr = await db('change_requests')
        .where({ change_request_id: cr.change_request_id })
        .first()

      expect(updated_cr.status).to.equal('Closed')
      expect(updated_cr.closed_at).to.exist
    })
  })
}).timeout(30000)
